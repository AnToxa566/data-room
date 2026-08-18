# Architecture

This document is the reference for **how changes should be made** in this repository.
It exists so that a decision made in week one is still legible in week six — to a
teammate or to an agent.

For what the product is and how to run it, see [README.md](./README.md).

> **Rule of thumb:** if a change contradicts something in this file, the change is wrong
> or this file is out of date. Fix one of the two — never proceed with both in conflict.

---

## 1. System shape

```
Browser
  │
  ├─ SPA (Vercel) ──── HTTPS/JSON ────► API (Cloud Run) ──► Postgres (Supabase)
  │                    ts-rest contract                     via Prisma + pg adapter
  │
  └─ direct PUT/GET via time-limited signed URLs ──► Google Cloud Storage
```

**File bytes never pass through the API.** The API issues signed URLs and records
metadata; the browser talks to storage directly. This is a structural decision, not an
optimization — see §5.

---

## 2. Project graph and module boundaries

```
        ┌─────────────┐        ┌─────────────┐
        │  apps/web   │        │  apps/api   │
        └──────┬──────┘        └──────┬──────┘
               │                      │
       ┌───────┴───────┐              ├──────────────┐
       ▼               ▼              ▼              ▼
  ┌─────────┐   ┌─────────────┐  ┌─────────────┐  ┌──────────┐
  │ libs/ui │   │ libs/       │  │ libs/       │  │ libs/    │
  │         │   │ contracts   │  │ contracts   │  │ database │
  └─────────┘   └─────────────┘  └─────────────┘  └──────────┘
```

### Allowed dependencies

| Project | May import | Must never import |
|---|---|---|
| `apps/web` | `contracts`, `ui` | `database`, `apps/api` |
| `apps/api` | `contracts`, `database` | `ui`, `apps/web` |
| `libs/contracts` | *(nothing in this repo)* | everything |
| `libs/database` | *(nothing in this repo)* | `contracts`, `ui`, any app |
| `libs/ui` | *(nothing in this repo)* | `contracts`, `database`, any app |

These are enforced by `@nx/enforce-module-boundaries` using tags in each project's
config, so a violation fails lint rather than review:

| Project | tags |
|---|---|
| `apps/web` | `type:app`, `scope:web` |
| `apps/api` | `type:app`, `scope:api` |
| `libs/contracts` | `type:contract`, `scope:shared` |
| `libs/database` | `type:data`, `scope:api` |
| `libs/ui` | `type:ui`, `scope:web` |

**Why `contracts` depends on nothing.** It is imported by both ends. The moment it pulls
in a Prisma type, the frontend transitively depends on the database client — bundle
bloat at best, leaked internals at worst. Contract types are declared with zod and stand
alone; any resemblance to Prisma models is intentional duplication.

**Why `database` is not imported by `web`.** Prisma models are storage shapes. API
responses are contract shapes. They differ deliberately: `size` is `BigInt` in the
database and `string` over the wire, `passwordHash` exists in one and must never appear
in the other. Keeping them separate makes the second fact structural rather than a thing
someone has to remember.

---

## 3. Project responsibilities

### `libs/contracts`
The single source of truth for the HTTP surface. Every endpoint's path, method, params,
body, and every response status is declared here as a ts-rest contract with zod schemas.
The API implements it; the SPA consumes it. Neither declares request or response types
of its own.

Shared schemas live in `common.ts` and are composed, never copy-pasted.

### `libs/database`
Prisma schema, migrations, and `PrismaService`/`PrismaModule` for Nest. Owns the physical
data model. Exports the generated Prisma types for use inside `apps/api` only.

### `libs/ui`
Presentational components only — shadcn/ui primitives plus composites built from them,
and the shared Tailwind preset. Nothing here fetches data, reads route params, or knows
what a Data Room is. If a component needs a query, it belongs in `apps/web`.

### `apps/api`
Feature modules, one per domain area. Each module owns its controller (implementing the
contract), its service (business rules), and its authorization checks. Controllers do not
contain logic; services do not know about HTTP.

### `apps/web`
Routing, data fetching, and feature composition. Uses `@ts-rest/react-query` so query and
mutation types come from the contract with no hand-written client.

---

## 4. Domain invariants

These are not style preferences. Breaking one produces silent data corruption or a
security hole.

### Every Data Room has exactly one root folder

- The root is the only `Folder` with `parentId = null`.
- `File.folderId` and `Folder.parentId` are non-null for every other node.
- The root cannot be renamed, moved, or deleted independently of its Data Room.
- Creation is transactional — `DataRoom` (with `rootFolderId = null`) → root `Folder` →
  update `rootFolderId`. The nullable column exists solely to break the circular FK, and
  must never be null outside that transaction.

### `Folder.path` is a materialized path and must stay consistent

- Format: `/rootId/childId/thisId/` — leading and trailing slashes, **includes the
  folder's own id**.
- `depth` is the number of segments, kept in sync.
- **Moving a folder rewrites `path` and `depth` for the entire subtree**, in one
  transaction. There is no operation that changes `parentId` without doing this.
- A folder may never be moved into its own subtree. Check before writing:
  the target's `path` must not start with the source's `path`.

### `storageKey` is derived from the file id and is immutable

Never contains the filename, the folder, or anything a user can change. Rename and move
touch only Postgres. If you find yourself writing a copy-then-delete against the bucket
for a rename, the invariant has been broken.

### Uniqueness of names is enforced by the database

`UNIQUE (parentId, name)` on folders, `UNIQUE (folderId, name)` on files. Application-level
"check then insert" loses the race under concurrent uploads. Catch the constraint
violation and translate it to `409`; do not pre-check as the primary mechanism.

### Authorization is resolved through inheritance, in one query

Access to a resource may originate from a share on the resource itself, on **any ancestor
folder**, or on the Data Room. Ancestors come from `path`, so this is a single query.

Two rules that are easy to get wrong:

- **Strongest role wins.** Multiple shares may match; take the most permissive.
  Never depend on row order.
- **Shared subtrees are scoped.** A recipient of a shared folder may navigate *down* from
  it, never up or sideways. The shared resource becomes their virtual root, and
  breadcrumbs are computed relative to it. Listing endpoints therefore take the share
  context, not just a folder id.

Never resolve permissions by email. `granteeEmail` is an invitation record; only
`granteeUserId` is an access key.

---

## 5. File upload: two-phase with signed URLs

```
1. POST /files/upload-url   → reserve a File row (status PENDING), return { fileId, uploadUrl }
2. PUT  <uploadUrl>         → browser uploads straight to GCS, reports native progress
3. POST /files/:id/complete → record size and mimeType, PENDING → READY
```

Why not simply POST the file to the API:

- Serverless request-body limits (~32 MB on Cloud Run) would cap file size at a value
  that has nothing to do with the product.
- Proxying occupies a container instance for the duration of the transfer and pays for
  the bandwidth twice.
- Signed URLs are required for **downloads** regardless — the bucket is private, and
  streaming every PDF view through the API is not viable. The signing infrastructure
  exists either way; using it for uploads is marginal.

What the two-phase shape buys beyond that: the `File` row is reserved **before** any bytes
move, so a name conflict returns `409` immediately instead of after an 80 MB upload, and
the client has a real `fileId` to attach progress state to.

Cost to be aware of: a client that uploads but never confirms leaves a `PENDING` row.
`PENDING` files are excluded from listings and from size aggregates, and are swept after
a timeout.

---

## 6. Adding an endpoint — contract first, always

The order is not negotiable. Writing the controller first produces ad-hoc DTOs and
defeats the point of ts-rest.

1. **Contract** — add the endpoint to the relevant file in `libs/contracts`, including
   every response status it can return. Reuse schemas from `common.ts`.
2. **Backend** — implement it in the matching Nest module via `@ts-rest/nest`. The
   controller validates nothing by hand and declares no types; the contract does both.
3. **Frontend** — consume it through `@ts-rest/react-query`. Do not write a fetch wrapper.

If the shape feels awkward to express in the contract, that is signal about the API
design, not a reason to bypass the contract.

---

## 7. Conventions

**Errors.** Every error response uses the shared `ErrorSchema`. Status codes carry
meaning: `403` means authenticated but not permitted; `404` means not found *or*
deliberately hidden from this user — never leak the existence of a resource someone
cannot see.

**Pagination.** Cursor-based everywhere, opaque cursor string, `limit` default 50 and
capped at 100. Offset pagination is not used anywhere in this codebase.

**BigInt.** `File.size` is `BigInt` in Postgres and a **string** over the wire.
`JSON.stringify` throws on BigInt, so a global serializer handles the conversion. Never
type a size as `number` in a contract — 2^53 is not a limit worth inheriting for free.

**Naming.** Tables are `snake_case` via `@@map`; Prisma models and TypeScript are
`camelCase`/`PascalCase`. Files are `kebab-case`.

**Migrations.** Every schema change ships with a migration. Prisma v7 does **not** run
`generate` after `migrate` — run it explicitly.

**Secrets.** Never committed. Every new variable is added to `.env.example` with an empty
value in the same commit that introduces it.

---

## 8. Decision log

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Monorepo | Nx | Two repos | One contract library imported by both ends; a split repo turns type safety into version coordination |
| API contract | ts-rest + zod | OpenAPI codegen, tRPC | Runtime validation and static types from one declaration, no build step, plain REST for reviewers to inspect |
| Frontend framework | Vite SPA | Next.js | The job's stack is an SPA plus a separate NestJS API; SSR buys nothing for an authenticated document tool |
| Tree representation | Materialized path | Adjacency list, closure table | Adjacency needs recursion for every ancestor query; closure table is a second table to keep consistent. Path serves breadcrumbs, subtree aggregates, and permission inheritance from one indexed column |
| Top-level items | Explicit root folder | Nullable `folderId` | Removes a special case from every query and makes `UNIQUE (folderId, name)` actually enforceable |
| Data Rooms per user | Many | One workspace per user | "Share a Data Room" is only a meaningful primitive if a user can have more than one; one deal per room matches the domain |
| Share model | One flat table | `Share` + `ShareGrant` | Both modes are the same statement with a different subject; the two-level version is empty in one mode and meaningless in the other |
| Revocation | Soft (`revokedAt`) | Row delete | Access history is auditable and the UI can say "revoked" rather than 404 |
| Upload path | Signed URL, two-phase | Proxy through API | Platform body-size limits, double bandwidth, and signing is needed for downloads anyway |
| Storage key | Derived from file id | Derived from path + filename | Rename and move stay pure DB operations |
| Postgres host | Supabase | Cloud SQL | Managed, free tier, no proxy setup; storage stays on GCS |
| Prisma version | v7 | v6 | Current major; requires the `prisma-client` generator, explicit `output`, `prisma.config.ts`, and a driver adapter |

---

## 9. Non-goals

Deliberately out of scope. Do not build these without a decision to change scope.

- Real-time collaboration or presence
- Document preview beyond native browser PDF rendering
- Full-text search *inside* document contents (filename search is in scope)
- Audit-log UI (the data supports it; the screen is not built)
- Multi-tenant organizations or teams above the user level
- Editor-role write operations (the role exists in the model; enforcement is viewer-only for now)
