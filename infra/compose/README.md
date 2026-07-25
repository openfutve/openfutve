# Compose stack

One command brings up the whole local stack. This is also the self-host quickstart — the
same file, no separate "production" variant to drift out of sync.

```bash
cp .env.example .env
docker compose -f infra/compose/docker-compose.yml up
```

Run it from the repo root so `.env` is picked up; paths in the file are relative to
`infra/compose/`.

## What's in v0 (Phase 0)

| Service | Role |
|---------|------|
| `postgres` | Serving database ([ADR 0002](../../docs/adr/0002-postgres-serving-db.md)) |
| `migrate` | Runs `packages/db` migrations, then exits. Everything waits on it. |
| `poller` | Placeholder poller — verifies connectivity and the source registry. Does not fetch anything yet. |

## What's coming

- **Phase 1:** `api`, `web`, a real TheSportsDB poller, the Wikipedia backfill scraper.
- **Phase 2:** `redpanda`, `redpanda-console`, Flink jobmanager/taskmanager.
- **Phase 2:** Grafana + Loki, with dashboards mounted from `infra/grafana/`.

## Useful commands

```bash
# reset the database completely
docker compose -f infra/compose/docker-compose.yml down -v

# psql into it
docker compose -f infra/compose/docker-compose.yml exec postgres \
  psql -U openfutve -d openfutve

# rerun migrations only
docker compose -f infra/compose/docker-compose.yml run --rm migrate
```

## Ground rule

If a change makes the stack need more than `docker compose up` to start, it needs a very
good reason. The self-host story *is* the product for a chunk of our audience — see the
README.
