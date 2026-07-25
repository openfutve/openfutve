# Placeholder poller image. Build context is the repo root.
#
# This installs with npm, which cannot resolve `workspace:*`. The moment a
# poller imports @openfutve/shared — which #51 and #48 will, for the team alias
# table — this must become a proper multi-stage pnpm workspace build. That is
# issue #20, and it therefore blocks containerising the real pollers.

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
CMD ["node", "dist/index.js", "selfcheck", "--force"]
