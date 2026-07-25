# ADR 0001 — Monorepo with pnpm workspaces + Turborepo

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Salvador

## Context

openFutVE spans a REST API, an SSR web app, pollers, Flink jobs (JVM/Python), Postgres
migrations, shared schemas, and notebooks. These change together: a schema change touches
`packages/schema`, a Flink job, a migration, and the API in one logical unit.

Splitting them across repos would mean version-bump choreography for every schema change,
with a three-person, part-time team (~5–8 h/person/week) of mixed seniority. That overhead
would land squarely on the least experienced contributors.

The two credible monorepo task runners are Turborepo and Nx.

## Decision

One monorepo. **pnpm workspaces** for package management, **Turborepo** for task
orchestration and caching. Flink jobs live in the same repo but build with their own
Maven/Gradle toolchain, invoked from Turborepo as opaque tasks.

## Rationale

**Why Turborepo over Nx:**

- **Learning curve.** Turborepo is a thin layer over `package.json` scripts. A contributor
  who knows npm scripts is already productive. Nx introduces executors, generators and its
  own project graph configuration — real power, real onboarding cost. With two people being
  mentored into this stack, that cost is the deciding factor.
- **Self-hostable remote cache.** Turborepo's remote cache protocol is an open HTTP API we
  can run on the homelab. Nx's self-hosted caching story is paid / Nx Cloud-oriented. For a
  project whose *identity* is "you can self-host all of this", depending on a vendor cloud
  for our own builds is a contradiction we'd have to explain in the README.
- **Scale mismatch.** Nx's strengths — enforced module boundaries, code generators, graph
  analysis on hundreds of projects — don't pay for themselves at ~6 packages. We can enforce
  boundaries by review at this size.
- **Neutral on the JVM side.** Flink builds stay Maven/Gradle under either tool, so neither
  wins there.

**Why this is safe to revisit:** both tools sit on top of pnpm workspaces, and the workspace
layout is what actually shapes the code. Migrating `turbo.json` to Nx later is roughly a
day's work. Low lock-in, so we optimize for today's team.

## Consequences

- Contributors need `pnpm` (via corepack) and Node ≥ 20.
- Task caching is local until Yuyo stands up a remote cache on the homelab; CI will not
  share a cache before then, so early CI runs are slower than they need to be.
- Cross-language dependencies (TS ↔ Flink) are not expressed in the task graph. The
  contract between them is `packages/schema`, and schema compatibility is enforced by tests,
  not by the build tool.
- Turborepo cannot express runtime-only coupling. Notably, `web#build` must **not** depend
  on `api` — see [ADR 0006](0006-react-router-ssr-web.md).
