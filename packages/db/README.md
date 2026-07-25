# @openfutve/db

Postgres migrations and seed data. This package owns the schema; nothing else creates or
alters tables.

## Migration tool: dbmate

Plain `.sql` files with `-- migrate:up` / `-- migrate:down` markers, applied in filename
order. Chosen over an ORM's migration DSL because the schema is read by TypeScript
services, Flink jobs and notebooks alike — it should not be expressed in any one language's
framework. ([ADR 0002](../../docs/adr/0002-postgres-serving-db.md))

## Usage

```bash
export DATABASE_URL=postgres://openfutve:openfutve@localhost:5432/openfutve?sslmode=disable

pnpm migrate           # apply pending migrations
pnpm migrate:new NAME  # create a new migration file
pnpm migrate:down      # roll back the last one
pnpm seed              # load db/seeds/*.sql
```

In compose, migrations run automatically via the `migrate` service before the API and
pollers start.

## Rules

1. **Migrations are append-only.** Never edit one that has been merged — write a new one.
2. **Every `down` must actually work.** Test it locally before opening the PR.
3. **No column without a data-dictionary entry.** A migration PR that doesn't touch
   [`docs/data-dictionary.md`](../../docs/data-dictionary.md) had better not be adding
   columns.
4. **Provenance columns are mandatory** on every fact table: `source`, `fetched_at`,
   `confidence`, `ingested_at` ([ADR 0005](../../docs/adr/0005-raw-first-ingestion.md)).
5. **Stay Supabase-compatible.** Only extensions available on Supabase's managed Postgres
   (`pgcrypto` is fine). Anything else needs an ADR.
