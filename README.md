# openFutVE

Open data platform for Venezuelan football (Liga FUTVE Primera División).

A self-hostable data warehouse, a public read-only API, a web platform, and published,
reproducible analysis — all in one monorepo, all open source.

> **Status: Phase 0 (foundation).** The pipeline is being built in the open. Nothing here
> is stable yet, and no data is published yet.

## Why

Venezuelan football has no accessible, machine-readable, historical record. Match results,
squads and standings live in scattered HTML pages, PDFs and third-party APIs with partial
coverage — each with its own team-name spellings and its own gaps. Anyone who wants to ask
a quantitative question about FUTVE has to start by rebuilding the dataset.

openFutVE exists so that work happens once, in public:

- **Ingest** from every source we can lawfully use, keeping the raw payload forever.
- **Normalize** into one schema with explicit provenance on every fact.
- **Serve** it over a public API and a web dashboard.
- **Publish** analysis with the notebook attached, so every claim can be re-run.

The pipeline is the product. If you'd rather not trust our numbers, run the stack yourself
and materialize your own — that's a supported path, not a workaround.

## Architecture

```
                  ┌────────────────────────────────────────────┐
   sources        │                 openFutVE                  │
 ┌───────────┐    │                                            │
 │TheSportsDB│──┐ │  ┌─────────┐   raw.{source}   ┌──────────┐  │
 │ Wikipedia │──┼─┼─▶│ pollers │ ───────────────▶ │ Redpanda │  │
 │ ligafutve │──┤ │  └─────────┘   (Phase 2+)     └────┬─────┘  │
 │  FVF site │──┘ │       │                            │        │
 └───────────┘    │       │ (Phase 1: direct)     ┌────▼─────┐  │
                  │       │                       │  Flink   │  │
                  │       │                       │  jobs    │  │
                  │       │                       └────┬─────┘  │
                  │       │        ┌───────────┐       │        │
                  │       └───────▶│ Postgres  │◀──────┘        │
                  │                └─────┬─────┘                │
                  │                      │                      │
                  │                ┌─────▼─────┐                │
                  │                │ apps/api  │ REST + WS      │
                  │                └─────┬─────┘                │
                  │                      │ HTTP                 │
                  │                ┌─────▼─────┐                │
                  │                │ apps/web  │ SSR + prerender│
                  │                └───────────┘                │
                  └────────────────────────────────────────────┘
```

Phase 1 deliberately runs **poller → Postgres** with no Kafka. The streaming backbone is
introduced in Phase 2 only once we can point at the concrete pain it solves (see
[ADR 0007](docs/adr/), to be written).

Key decisions are recorded as ADRs in [`docs/adr/`](docs/adr/):

| ADR | Decision |
|-----|----------|
| [0001](docs/adr/0001-monorepo-pnpm-turborepo.md) | Monorepo with pnpm workspaces + Turborepo |
| [0002](docs/adr/0002-postgres-serving-db.md) | Postgres as the serving database |
| [0003](docs/adr/0003-redpanda-as-log.md) | Redpanda as the Kafka-compatible log |
| [0004](docs/adr/0004-avro-schemas.md) | Avro schemas from day 1 |
| [0005](docs/adr/0005-raw-first-ingestion.md) | Raw-first ingestion |
| [0006](docs/adr/0006-react-router-ssr-web.md) | React Router framework mode, SSR |

## Repository layout

```
apps/api          Fastify — public REST API (+ WebSocket gateway from Phase 3)
apps/web          React Router framework mode, SSR — dashboard + prerendered analysis posts
apps/pollers      Source pollers/scrapers, one module per source
streaming/jobs    Flink jobs (normalize, match-state, aggregates)
streaming/sql     Flink SQL analytical jobs
packages/schema   Avro schemas + generated types — single source of truth
packages/db       Postgres migrations + seed data
packages/shared   Shared TS utils (entity resolution, source configs)
analysis/         Notebooks and published posts
infra/compose     docker-compose for local dev and self-hosting
infra/grafana     Dashboards and alert rules as code
tools/replay      CLI: replay historical events into the pipeline at Nx speed
docs/             ADRs, data sources, data dictionary
```

## Quickstart (local / self-host)

Requires Docker and Docker Compose.

```bash
git clone https://github.com/openfutve/openfutve.git
cd openfutve
cp .env.example .env
docker compose -f infra/compose/docker-compose.yml up
```

That brings up Postgres, runs migrations, and starts the poller. See
[`infra/compose/README.md`](infra/compose/README.md).

For development on the JS side:

```bash
pnpm install
pnpm dev
```

## Scraping ethics

This project only works if it is a good citizen of the sites it reads. These rules are
non-negotiable and apply to every poller:

- **Identify the bot.** Every request sends a descriptive `User-Agent` naming the project
  and linking here.
- **Honor `robots.txt`** and any published rate limits. Where none is published, we stay
  well under one request per second per host.
- **Cache aggressively.** Raw payloads are stored, so a parser change never justifies
  re-fetching. Conditional requests (`ETag`/`If-Modified-Since`) wherever supported.
- **Respect Terms of Service.** Every source is audited and recorded in
  [`docs/data-sources.md`](docs/data-sources.md) *before* code is written against it. If a
  source's ToS forbids automated access, we don't scrape it.
- **Document provenance per row.** Every fact carries `source`, `fetched_at` and
  `confidence`. No exceptions.

## Contributing

Everything goes through pull requests, including from maintainers. Anything structural
needs an ADR. No field enters Postgres without an entry in
[`docs/data-dictionary.md`](docs/data-dictionary.md).

Scope is deliberately narrow: **FUTVE Primera División only.** Segunda División, Copa
Venezuela and the women's league are future issues, not branches.

## Licensing

- **Code:** [Apache-2.0](LICENSE)
- **Data:** see [LICENSE-DATA](LICENSE-DATA) — the compiled database and upstream sources
  carry different terms, tracked per dataset.
