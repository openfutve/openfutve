# ADR 0002 — Postgres as the serving database

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Salvador, Edder, Yuyo

## Context

We need a database that serves the public API, holds the normalized match/team/player
record, and is queryable directly by an analyst. Requirements:

- Self-hostable in a `docker compose up`, since self-hosting is a product goal.
- Familiar to the whole team — nobody should be learning the datastore *and* the domain.
- Good enough analytically for league-scale data. FUTVE is roughly a few thousand matches
  and tens of thousands of match events per decade: small.
- Able to express upserts and idempotent writes cleanly, because Phase 2 sinks from Flink
  will re-deliver rows.

## Decision

**PostgreSQL** as the serving database, kept **Supabase-compatible**: no extensions or
features beyond what Supabase's managed Postgres offers, so we can move between a
self-hosted container and Supabase cloud without a migration.

Migrations are plain SQL, applied by a lightweight runner (dbmate), living in
`packages/db`. See `packages/db/README.md`.

## Rationale

- The team already knows Postgres. That is worth more than any benchmark at this stage.
- `ON CONFLICT ... DO UPDATE` gives us idempotent sinks without inventing a protocol.
- Constraints, foreign keys and `CHECK`s let the schema enforce the data contract, which
  matters when several pollers write the same tables.
- Staying Supabase-compatible keeps a zero-ops hosting option open if the homelab proves
  unreliable, without a rewrite.
- Plain-SQL migrations (over an ORM's migration DSL) keep the schema readable by the
  analyst, who will read it far more often than the API author does.

## Alternatives considered

- **ClickHouse / DuckDB as the serving store.** Better analytically, but worse at the
  transactional upsert pattern our sinks need, and less familiar. DuckDB *will* appear in
  Phase 4 for the published Parquet archive — as a consumer of exports, not as the
  system of record.
- **SQLite.** Genuinely sufficient for this data volume, and trivially self-hostable. Ruled
  out for concurrent writers (multiple pollers plus Flink sinks) and the weaker managed
  hosting path.
- **An ORM-owned schema (Prisma/Drizzle migrations).** Rejected to keep the schema
  language-neutral: Flink jobs and notebooks touch these tables too.

## Consequences

- Analytical queries over the full history will eventually outgrow Postgres. That is the
  trigger for the Phase 4 Parquet/DuckDB archive, not a reason to change now.
- We forgo Postgres extensions unavailable on Supabase; if one becomes necessary, this ADR
  gets superseded rather than quietly violated.
- Every fact table carries `source`, `fetched_at` and `confidence` columns
  ([ADR 0005](0005-raw-first-ingestion.md)), which is a schema-level cost we accept on
  every write path.
