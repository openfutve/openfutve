# Placeholder poller image (Phase 0). Build context is the repo root.
#
# Phase 1 replaces this with a proper pnpm workspace build once the poller has
# workspace dependencies (@openfutve/schema, @openfutve/shared) — see the
# "Docker images per app" issue.

FROM node:22-alpine AS build

WORKDIR /repo
COPY tsconfig.base.json ./
COPY apps/pollers/package.json apps/pollers/tsconfig.json ./apps/pollers/

WORKDIR /repo/apps/pollers
RUN npm install --no-audit --no-fund

COPY apps/pollers/src ./src
RUN npx tsc -p .

FROM node:22-alpine AS runtime

WORKDIR /app
COPY apps/pollers/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /repo/apps/pollers/dist ./dist

USER node
CMD ["node", "dist/index.js"]
