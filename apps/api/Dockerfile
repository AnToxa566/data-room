# syntax=docker/dockerfile:1.7
#
# Build context is the repo root:
#   docker buildx build --platform linux/amd64 -f apps/api/Dockerfile -t dataroom-api .
# (linux/amd64 is required — Cloud Run does not run arm64 images, and an Apple Silicon
# build without --platform fails at container startup with an error that looks
# unrelated to the code. See README.md "Deployment".)
#
# Two stages:
#   build   — full toolchain (Nx, TypeScript, Prisma CLI, npm workspaces). Generates the
#             Prisma client, builds @dataroom/api, then uses Nx's own prune-lockfile +
#             copy-workspace-modules targets to produce a self-contained
#             apps/api/dist/{package.json,package-lock.json,workspace_modules/}, and
#             npm-installs THAT into its own node_modules.
#   runtime — copies only that self-contained dist (already carrying production-only
#             node_modules) into a bare node:22-slim image. No Nx, no TypeScript, no
#             Prisma CLI, no devDependencies, no monorepo source crosses into this stage.
#
# Never runs `prisma migrate deploy` here — migrations are a dev-machine operation
# against the direct database connection. See README.md "Deployment".

FROM node:22-slim AS build
WORKDIR /workspace

# Disables Nx's daemon and first-run interactive prompts — don't suit a one-shot,
# non-TTY container build.
ENV CI=true

COPY . .
RUN npm ci

# Gitignored — must exist before `nx build` typechecks/bundles PrismaService's static
# import of it.
RUN npx nx run @dataroom/database:prisma-generate

RUN npx nx build @dataroom/api

# Pruned package.json/lockfile from @dataroom/api's real (production) dependency graph,
# plus its workspace-lib deps (@dataroom/contracts, @dataroom/database) copied in as
# installable local packages.
RUN npx nx run @dataroom/api:prune

WORKDIR /workspace/apps/api/dist
RUN npm install --omit=dev --force

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# node:22-slim ships a pre-created, non-root `node` user (uid 1000) — no need to create
# one. --chown here (rather than a separate `chown` step) keeps this to one layer.
COPY --chown=node:node --from=build /workspace/apps/api/dist ./

USER node

# Documentation only — does not change binding behavior. Cloud Run injects the real
# PORT at runtime; main.ts binds to 0.0.0.0:$PORT.
EXPOSE 8080

CMD ["node", "main.js"]
