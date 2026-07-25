# Poller image. Build context is the repo root.
#
# A real pnpm workspace build: the previous placeholder installed with npm,
# which cannot resolve `workspace:*`, so a poller could not import
# @openfutve/shared — which #51, #48 and #12 all need for the team alias table.
#
# Layered so a code change does not re-download dependencies: manifests and the
# lockfile land first, and `--filter @openfutve/pollers...` installs only this
# app and what it depends on, so the web app's toolchain is never fetched.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---- dependencies -----------------------------------------------------------
# Only the manifests, so this layer is cached until the lockfile changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/pollers/package.json apps/pollers/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @openfutve/pollers...

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/pollers apps/pollers
RUN pnpm --filter @openfutve/shared build \
 && pnpm --filter @openfutve/pollers build

# `pnpm deploy` resolves workspace links into a self-contained tree, which is
# the point: the runtime stage needs no pnpm, no workspace and no symlinks.
RUN pnpm deploy --filter @openfutve/pollers --prod /out

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out ./
USER node
CMD ["node", "dist/index.js", "selfcheck", "--force"]
