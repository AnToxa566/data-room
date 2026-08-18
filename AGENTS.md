# Data Room — agent instructions

A virtual Data Room: a secure document repository with nested folders, direct-to-storage
uploads, and revocable sharing at Data Room / folder / file level. Built for
due-diligence workflows, so correctness of access control matters more than feature count.

## Read these before making changes

| Question | File |
|---|---|
| What is this, how do I run it, what are the env vars? | [`README.md`](./README.md) |
| What may import what? What are the domain invariants? Why was X chosen? | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |

`ARCHITECTURE.md` is binding. If a task appears to require breaking a rule in it, stop
and say so rather than working around it.

---

## Stack — do not substitute

React 18 + Vite + TypeScript · TanStack Query/Router/Table · Tailwind · shadcn/ui + Radix ·
NestJS · **ts-rest + zod** · **Prisma v7** + PostgreSQL (Supabase) · Google Cloud Storage ·
Nx · npm · Vitest · Playwright · Storybook

Never swap a library for an equivalent because it is more familiar. If something here
genuinely cannot do the job, raise it — do not silently substitute.

---

## Verify current docs before writing code

Training data is stale for several of these. Check current documentation first:

- **Prisma v7** — breaking changes throughout: the generator is `prisma-client` (not
  `prisma-client-js`), `output` is required, the client is not emitted into
  `node_modules`, datasource URLs live in `prisma.config.ts`, a driver adapter is
  mandatory, and `migrate` no longer runs `generate`. Prisma v7 is ESM-first, which can
  collide with a CommonJS Nest build; there is a `moduleFormat` escape hatch. **Never
  resolve an ESM/CJS problem by downgrading to Prisma v6** — report it instead.
- **ts-rest** — verify current package names and the Nest / React Query integration API.
- **TanStack Query v5** — verify hook and options signatures.
- **Nx generators** — flags change between majors. Check `--help` or the docs; do not
  guess.

---

## Hard rules

1. **Contract first.** New or changed endpoint → `libs/contracts` first, then the Nest
   controller, then the frontend. Never hand-write request/response types in an app.
2. **Respect module boundaries.** See the dependency table in `ARCHITECTURE.md` §2.
   In particular: Prisma types never reach `apps/web`, and `libs/ui` never fetches data.
3. **No new dependency without saying so.** Adding a package is a decision; call it out
   in your summary with the reason.
4. **Never weaken an authorization check to make something work.** If a permission check
   blocks a feature, the design is wrong somewhere — surface it.
5. **Migrations for every schema change**, plus an explicit `prisma generate`.
6. **New env var → `.env.example` in the same commit**, empty value. Never commit secrets.
7. **Run tasks through Nx**, prefixed with npm — `npx nx …` — not the underlying tooling.
8. **Do not scaffold what exists.** `apps/web`, `apps/api`, `libs/contracts`,
   `libs/database`, `libs/ui` are already generated.

---

## Domain invariants you can break by accident

Read `ARCHITECTURE.md` §4 in full before touching folders, files, or sharing. The short
version:

- Every Data Room has exactly one root folder; it is the only folder with `parentId = null`
- Moving a folder rewrites `path` and `depth` for its **entire subtree**, transactionally
- A folder can never be moved into its own subtree
- `storageKey` derives from the file id — rename and move never touch the bucket
- Name uniqueness is a database constraint; catch the violation and return `409`
- Permission resolution takes the **strongest** matching role, and never reads
  `granteeEmail` — only `granteeUserId`
- A shared folder is the recipient's virtual root: they navigate down from it, never up

---

## Definition of done

Before reporting a task complete:

```bash
npx nx run-many -t lint,test,build
```

- Passes clean, with no new lint suppressions or `any`
- New endpoints exist in the contract and type-check in **both** apps
- Schema changes have a migration, applied and generated
- Behaviour was actually exercised, not just compiled
- Anything intentionally left undone is stated explicitly

---

## Reporting back

Say what changed, what you decided and why, what you could not verify, and anything you
are uncertain about. A flagged uncertainty is more useful than a confident guess.

Do not describe work as finished when part of it is stubbed. Do not claim something was
tested if it was only built.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
