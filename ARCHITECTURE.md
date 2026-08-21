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
| `apps/web-e2e` | `apps/web`, `contracts`, `ui` | `database`, `apps/api` |
| `apps/api-e2e` | `apps/api`, `contracts` | `ui`, `apps/web` |
| `libs/contracts` | *(nothing in this repo)* | everything |
| `libs/database` | *(nothing in this repo)* | `contracts`, `ui`, any app |
| `libs/ui` | *(nothing in this repo)* | `contracts`, `database`, any app |

These are enforced by `@nx/enforce-module-boundaries` using tags in each project's
config, so a violation fails lint rather than review:

| Project | tags |
|---|---|
| `apps/web` | `type:app`, `scope:web` |
| `apps/api` | `type:app`, `scope:api` |
| `apps/web-e2e` | `type:e2e`, `scope:web` |
| `apps/api-e2e` | `type:e2e`, `scope:api` |
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
- **`path` is immutable after creation.** Folder move is out of scope (see §9) — nothing
  in this codebase rewrites a `path` once it's written. `path` and `depth` are set once, in the same transaction as the row's creation, and never touched again.

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

A `PUBLIC`-mode share applies to *every* caller, including one with no session at all
(`userId: null`, resolved by `resolveAccess`/`requireAccess` accepting a nullable caller)
— this is what makes an anonymous public-link visit work, and it's the same inheritance
and strongest-role-wins resolution as an `EMAIL`-mode share, not a separate mechanism.
The app URL for a shared resource never encodes which mode granted access — see §8's
public-link decision-log entries.

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
| Session token | Single JWT, no refresh | Refresh token + rotation, server-side session store | One documented simplification instead of a denylist/rotation system this iteration doesn't need; the cost is a compromised token stays valid until it expires (7 days), which is accepted explicitly rather than half-solved |
| Session transport | httpOnly cookie | `Authorization: Bearer` header + `localStorage` | A token in `localStorage` is readable by any script on the page — one XSS becomes account takeover. A cookie the browser sends automatically and JS can't read removes that entire class of theft, at the cost of needing CORS `credentials` and correct `SameSite`/`secure` config |
| OAuth routes vs. the ts-rest contract | `GET /auth/google` and `/auth/google/callback` are plain Nest controllers | Model them in `libs/contracts` like every other endpoint | Both are full-page 302 redirects, not JSON responses ts-rest's client parses; forcing them into the contract would either lie about the response shape or contort the contract to accommodate two routes nothing else in the API resembles |
| Pending-share resolution | Runs on every login, gated on the provider reporting the email verified | Resolve at share-creation time, or trust any claimed email | An unverified email is not proof of ownership — resolving invitations against one would let anyone claim a share addressed to someone else's inbox by typing their address into an OAuth consent screen that never confirmed it |
| OAuth `state` (CSRF) storage | Short-lived signed cookie, validated in `GoogleAuthGuard` | passport-oauth2's built-in session-backed state store | The built-in store needs `express-session`, which this app deliberately doesn't have (single stateless JWT, no server-side session — see above). A cookie-based nonce is also correct for a multi-instance Cloud Run deployment, where the initiating and callback requests aren't guaranteed to land on the same instance and an in-memory session store would intermittently fail |
| Authorization | One `AccessControlService`, every service/controller routes through `resolveAccess`/`requireAccess` | Per-module ownership checks (`if (room.ownerId !== userId)` inline in each service) | An inline check is easy to get right once and to forget in the fourth module, and iteration 5's sharing (inherited, strongest-role-wins) has to change every one of them if the check isn't centralized. One service means one place to extend, and a grep for `ownerId` outside it is a real, checkable invariant rather than a convention |
| Invisible-resource status | `404`, always — a resource a user can't see is indistinguishable from one that doesn't exist | `403` for "exists but not yours" | `403` on a resource id the caller supplied but was never told about *confirms the id is real* — an enumeration/information leak in a due-diligence tool, where the existence of a competing bidder's Data Room is itself sensitive. `403` is reserved for when the caller already provably knows the resource exists (a weaker share hitting a stronger check) — unreachable until iteration 5 added roles below `OWNER`; reachable now (e.g. a `VIEWER` share hitting an `EDITOR`-or-above check) |
| Public-link identity | Same canonical resource URL (`/files/:id`, …) as the owner/grantee, resolved by an active `PUBLIC`-mode `Share` row — no token in the URL | A distinct `/share/:token` URL with a `GET /shares/by-token/:token` lookup | Modelled on Google Drive: copying a link gives the same URL regardless of how it's shared, and turning link-sharing on/off never changes it. Keeps `AccessControlService` the single authorization surface instead of adding a second, token-based one alongside it |
| Public-link authentication | Fully anonymous — no session required | Requires being logged into the app | Matches Drive's actual behavior, which is what this was modelled on; `resolveAccess`/`requireAccess` accept `userId: null` and a `PUBLIC` share applies to it like any other caller |
| Folder delete confirmation | `GET /folders/:id/stats` (folder + file counts, size) called client-side before the delete request | A dedicated `GET /folders/:id/delete-preview` endpoint | `stats` already returns everything a "this will delete N folders and M files" warning needs, computed the same way (path-prefix scan) either endpoint would use. A second endpoint would be the same query with a different name — two things to keep in sync for one piece of information |
| File metadata source of truth | Read back from GCS in `complete`, never accepted from the client | Trust the client's declared `size`/`mimeType` | A client can report any size — 0 defeats every limit, and a fabricated value would silently corrupt subtree size aggregates. GCS's own object metadata is the only value nothing upstream of it can lie about |
| Delete ordering (file, folder subtree, Data Room) | Database row(s) first, then a best-effort blob delete | Blob first, then the row | Deleting the row first means a failure on the storage half never leaves a row pointing at a live blob nobody can reach through the API — the reverse order can leave a row pointing at *nothing*, a file that lists but 404s on open. An orphaned blob is comparatively harmless and is swept by prefix on the next Data Room/folder delete in that subtree |
| Upload transport | Simple V4 signed `PUT` | Resumable upload sessions | A resumable session needs its own initiation round trip, chunk-tracking state, and a retry protocol the client has to implement — none of which this iteration's scope (single-shot document upload, not multi-gigabyte video) needs. Out of scope deliberately, see §9 |
| Name conflict on upload-url | If the conflicting row is a stale (past `PENDING_TTL_MINUTES`) `PENDING` reservation, delete it and its blob, then proceed | Always `409` on any name collision | An upload that's cancelled or abandoned mid-flight leaves a `PENDING` row holding the name hostage — without this, "upload, cancel, upload again" fails with a conflict the user has no way to clear themselves. A collision against a fresh `PENDING` or `READY` row is still a real `409` |
| GCS signed-URL credentials in production | Application Default Credentials + IAM Credentials API `signBlob` | Shipping a service-account private key as an env var | No private key material to leak, rotate, or accidentally commit; the Cloud Run service account already holds `roles/iam.serviceAccountTokenCreator` on itself, which includes `iam.serviceAccounts.signBlob` — `@google-cloud/storage` calls it automatically once no explicit `credentials`/`keyFile` is passed. Local dev keeps an explicit key (no ADC outside GCP); `env.schema.ts` rejects the environment outright if exactly one of `GCS_CLIENT_EMAIL`/`GCS_PRIVATE_KEY` is set |
| `prisma` CLI package classification | `devDependencies` in `libs/database/package.json` | `dependencies` (as it shipped before) | `@nx/js:prune-lockfile` derives the API's production dependency set from each workspace package's declared `dependencies`; the CLI is only invoked by `prisma.config.ts` for `generate`/`migrate` (dev/build-time), never imported by `PrismaService` at runtime — leaving it misclassified pulled the full CLI into the lean Cloud Run image for no reason |
| API transport in production | Vercel rewrite proxies `/api/*` on the SPA's own origin to Cloud Run | Direct cross-origin call from the SPA to the API | The browser sees a same-origin request, so the session cookie is first-party — no `SameSite=None`/cross-site cookie fragility to reason about at all, on top of removing the need for CORS. See README's "Frontend" |
| Frontend routing | TanStack Router, code-based route tree | File-based routing | File-based needs a Vite plugin and a generated route-tree file — a build-step addition this iteration's two routes don't justify. Revisit once the route count grows |
| npm peer-dependency resolution | `.npmrc` with `legacy-peer-deps=true`, workspace-wide | A root `package.json` `overrides` pinning `react`/`react-dom` | `@ts-rest/react-query@3.52.1`'s peer range for `react` doesn't include 19 (this repo's actual version — see the React 18-vs-19 mismatch already noted above). `overrides` was tried first and does **not** reliably stop npm from nesting a second, duplicate `react` copy under `apps/web/node_modules` to satisfy that one peer — confirmed by a from-clean install. `legacy-peer-deps` is the one that empirically produces a single, deduped `react` across the whole tree. Trade-off: this relaxes peer-conflict *errors* to warnings workspace-wide, not just for this one package — see the comment in `.npmrc` |

---

## 9. Non-goals

Deliberately out of scope. Do not build these without a decision to change scope.

- Real-time collaboration or presence
- Document preview beyond native browser PDF rendering
- Full-text search *inside* document contents (filename search is in scope)
- Audit-log UI (the data supports it; the screen is not built)
- Multi-tenant organizations or teams above the user level
- Editor-role write operations (the role exists in the model; enforcement is viewer-only for now)
- Folder move. The model supports it — a recursive `path`/`depth` rewrite over the subtree, transactionally, with a check that the target isn't inside the source's own subtree — but the spec doesn't require it, and it was left out deliberately rather than half-built. See §4's `path` invariant and the decision log.
- Resumable uploads. A simple V4 signed `PUT` covers this iteration's document-upload use case; a resumable session (chunked, restartable mid-transfer) is real added complexity — client-side chunk tracking, a session-initiation round trip, its own retry protocol — with no requirement driving it yet. See the decision log.
- File versioning on a name conflict. `UNIQUE (folderId, name)` means a second file named `contract.pdf` in the same folder is a `409` today, not a new version. Versioning it properly needs either a separate `FileVersion` table (each version its own storage object, the `File` row pointing at "current") or dropping the uniqueness constraint and threading version-awareness through every listing, download, and permission check that currently assumes one row per name. Both are a real design decision this iteration didn't need to make; revisit if/when the product requires it.
