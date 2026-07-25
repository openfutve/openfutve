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
| `seed` | Loads `packages/db/db/seeds/*.sql` (the source registry), then exits. Idempotent. |
| `poller` | Runs the `selfcheck` poller — verifies connectivity and the source registry. Reaches no network. |

The poller image is a real pnpm workspace build (`apps/pollers/Dockerfile`), so
pollers can import `@openfutve/shared`. Published to GHCR on merge to main,
tagged by commit SHA. Compose builds locally rather than pulling, which is what
you want while developing; swapping to the published image is part of #21.

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

## Security defaults

Postgres binds to `127.0.0.1`. Widening `POSTGRES_BIND` while `POSTGRES_PASSWORD`
is still the `.env.example` placeholder makes the `preflight` service fail the
stack — that combination is never intentional, since the placeholder is published
in this repository.

**A host firewall will not protect a published Docker port.** Docker installs its
own DNAT rules that bypass `ufw` and `firewalld`, so `ufw deny 5432` does nothing.
Filtering belongs in the `DOCKER-USER` chain. This is the trap waiting for the
homelab deploy — see issue #50.

## Ground rule

If a change makes the stack need more than `docker compose up` to start, it needs a very
good reason. The self-host story *is* the product for a chunk of our audience — see the
README.
