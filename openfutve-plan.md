# openFutVE — Project Plan

Open data platform for Venezuelan football (Liga FUTVE). Self-hostable data warehouse + public web platform + published analysis. Monorepo, open source.

**Team:** Senior SWE (architecture, streaming, API, frontend) · Edder (data analysis, data modeling, published findings) · Yuyo (infra, DevOps, observability)

---

## 1. Monorepo structure

```
openfutve/
├── apps/
│   ├── api/                 # Node (Fastify) — public REST API
│   ├── web/                 # React Router framework mode (SSR) — dashboard + prerendered analysis posts
│   └── pollers/             # Node — source pollers/scrapers (one module per source)
├── streaming/
│   ├── jobs/                # Flink jobs (Java or PyFlink): normalize, match-state, aggregates
│   └── sql/                 # Flink SQL jobs (Edder's analytical jobs)
├── packages/
│   ├── schema/              # Avro/Protobuf schemas + generated types (single source of truth)
│   ├── db/                  # Postgres migrations (e.g. dbmate/atlas) + seed data
│   └── shared/              # shared TS utils (entity resolution helpers, source configs)
├── analysis/
│   ├── notebooks/           # Edder's Jupyter/Quarto notebooks
│   └── posts/               # markdown posts rendered on the web app
├── infra/
│   ├── compose/             # docker-compose for local dev + self-host quickstart
│   ├── k8s/ or terraform/   # real deploy (homelab or AWS) — added in Phase 2+
│   └── grafana/             # dashboards as JSON, alert rules
├── tools/
│   └── replay/              # CLI: replay historical events into the pipeline at Nx speed
├── docs/
│   ├── adr/                 # Architecture Decision Records (numbered)
│   ├── data-sources.md      # every source: URL, ToS notes, rate limits, fields, confidence
│   └── data-dictionary.md   # every table/topic/field defined
├── .github/workflows/       # CI: lint, test, build images, replay-based integration test
├── LICENSE                  # code license
├── LICENSE-DATA             # data license (see §6)
└── README.md
```

Tooling: pnpm workspaces + Turborepo for the JS side; Flink jobs build separately (Maven/Gradle) but live in the same repo. One `docker compose up` must bring up the whole local stack — this doubles as the self-host story.

---

## 2. Locked-in technical decisions (write ADRs 0001–0006 in week 1)

| # | Decision | Rationale (short) |
|---|----------|-------------------|
| 0001 | Monorepo, pnpm + **Turborepo** (over Nx) | thin layer over package.json scripts — low learning curve for mixed-seniority team; open remote-cache protocol is self-hostable on the homelab (Nx self-hosted caching is paid/Nx Cloud-oriented, a mismatch for a self-host-identity project); Nx's strengths (enforced boundaries, generators, huge graphs) don't pay off at 6 packages / 3 people; Flink builds stay Maven/Gradle under either tool; migration cost later is ~a day, so lock-in is low |
| 0002 | Postgres as serving DB (Supabase-compatible) | team knows it; self-host or Supabase cloud interchangeable |
| 0003 | Kafka-compatible log = **Redpanda** | single binary, easy homelab self-host, Kafka wire-compatible |
| 0004 | Schemas in Avro (or Protobuf) from day 1, in `packages/schema` | replayability is worthless without schema discipline |
| 0005 | Raw-first ingestion: pollers write **unparsed payloads** to `raw.{source}` topics | replay instead of re-scrape; parsers can evolve |
| 0006 | `apps/web` = **React Router framework mode, SSR** via its Node server; analysis post routes **prerendered** at build time | SSR server is just another container in compose — fits the self-host story with no serverless contortions; prerendered posts give Edder's published analysis SEO + fast shareable pages; dashboard/live-match routes stay loader- and WebSocket-driven. Rejected: SPA mode (no SEO for posts). Constraints: loaders use web-standard APIs only (keeps a future Cloudflare Workers deploy open) and call `apps/api` over HTTP — never import DB code — so the web app proves the public API is sufficient. Build note: `web#build` must not depend on `api` in `turbo.json` (runtime-coupled, not build-coupled) |

Deliberately deferred: AWS vs homelab (decide end of Phase 2 — everything runs in containers so it's portable), Iceberg/Parquet lake (Phase 4), auth on the API (public read-only until it matters).

---

## 3. Phases

### Phase 0 — Foundation (week 1, everyone)
- [ ] Create repo, structure above, licenses, README with vision + architecture diagram
- [ ] `docs/data-sources.md`: audit sources **before writing code** — TheSportsDB (league 4513, check what free key `123` returns for FUTVE; decide on the ~€9 premium for livescores), Sportmonks free tier (verify FUTVE coverage), API-Football (verify Venezuela coverage on free tier), Wikipedia season pages (historical backfill), ligafutve.com / FVF site (inspect HTML). Record ToS + rate limits per source.
- [ ] `packages/db`: initial schema — `teams`, `players`, `matches`, `match_events`, `standings_snapshots`, `sources`, plus `source`, `fetched_at`, `confidence` columns on every fact table
- [ ] docker-compose v0: Postgres + one poller
- [ ] Agree working rhythm: 1 weekly sync call, GitHub Projects board, PRs reviewed by you (mentoring channel for Edder/Yuyo)

**Done when:** repo public, sources documented, empty schema migrated, compose up works.

### Phase 1 — v0 pipeline: poller → Postgres (weeks 2–4)
No Kafka yet, on purpose. Ship something real, feel the pain, then justify the streaming layer in an ADR.

- **Edder:** Wikipedia historical backfill scraper (season tables → `matches`/`standings`). This is his onboarding project: real scraping, real data cleaning (team-name variants across decades), immediate analytical payoff. First notebook: league history — dominance eras, points distributions, home advantage over time.
- **You:** poller framework in `apps/pollers` (scheduler, per-source rate limiting, retries, structured logging); TheSportsDB poller for current-season fixtures/results; skeleton `apps/api` with 3 endpoints (`/teams`, `/matches`, `/standings`).
- **Yuyo:** CI (lint/test/build on PR), Docker images per app, deploy v0 to the homelab, uptime + logs (Grafana/Loki or similar), scheduled poller runs.

**Done when:** current season + ≥10 historical seasons in Postgres, API serves them, Edder publishes analysis post #1, everything running unattended on the homelab.

### Phase 2 — Streaming backbone: Redpanda + Flink Job 1 (weeks 5–8)
- Write **ADR 0007** first: the concrete pain from Phase 1 that Kafka solves (parser changes require re-scraping; no audit trail of what a source said when).
- **You:** pollers now write raw payloads to `raw.{source}`; Flink Job 1 (normalize): parse → entity-resolve team/player names against a `packages/shared` alias table → dedupe by content hash → emit to `events.match` → side-output unparseables to `dlq.{source}`; Postgres sink with upserts (exactly-once or idempotent).
- **Edder:** owns the entity-resolution alias table (analyst-shaped problem: which names refer to the same team across sources/decades); learns to read the DLQ and fix parsers with you.
- **Yuyo:** Redpanda + Flink (session or standalone cluster) on homelab; Grafana dashboards: consumer lag, checkpoint duration/size, backpressure, DLQ depth; alerting on lag + DLQ growth; compose updated so the full stack is one command.
- **Team:** build `tools/replay` now — reads a captured topic dump (or Parquet), replays into `raw.*` at configurable speed. Wire one replay-based integration test into CI.

**Done when:** all ingestion flows through Redpanda, a deliberate parser change is fixed via replay (no re-scrape), replay test green in CI, dashboards live.

### Phase 3 — Live matches: state machine + realtime UI (weeks 9–13)
Requires a livescore source (likely TheSportsDB premium, ~€9/mo — decide in Phase 0 audit).

- **You:** match-window scheduler (poll every 60–120s only around fixtures); Flink Job 2: keyed state per `match_id`, event-time + watermarks, snapshot-diff → discrete events (`match_started`, `goal_scored`, `score_corrected`, `status_changed`), handle out-of-order polls and retractions; `events.derived` topic → WebSocket gateway in `apps/api`.
- **Edder:** Flink SQL job on `events.match`/`events.derived`: rolling form windows, live standings recomputation; defines what "form" means (analyst decision, documented in data dictionary).
- **Yuyo:** WebSocket infra behind Cloudflare; load-test with the replay tool at 100×; runbook for match-day incidents.
- **Web:** live match page + live standings on `apps/web`.

**Done when:** a real FUTVE matchday flows source → Kafka → Flink → WebSocket → browser with no human involvement, and the same matchday replays deterministically in CI.

### Phase 4 — Analytics & publication (weeks 14+, ongoing)
- Parquet archive of topics to R2/S3; DuckDB access documented for external analysts
- Edder: post series (aging curves, home advantage, competitive balance, xG-approximation if shot data exists) published in `analysis/posts` and rendered on the web; each post ships with its notebook — reproducibility is the differentiator
- Public API docs + "self-host openFutVE" guide (the compose stack **is** the product for that audience)
- Optional: Flink CEP patterns (comeback detection, red-card impact) as a showcase job

---

## 4. Working agreements

- **PR discipline:** everything through PRs; you review Edder/Yuyo, they review each other and (yes) you. Reviews are the mentoring channel — write them like it.
- **ADRs for anything structural.** Interviewers read ADRs; they don't read code.
- **Data contract:** no field enters Postgres without an entry in `data-dictionary.md`. Edder owns the dictionary.
- **Scraping ethics in README:** identify the bot in User-Agent, honor robots.txt and rate limits, cache aggressively, document provenance per row. Non-negotiable for an open data project's credibility.
- **Scope guard:** one league (FUTVE Primera). Segunda, Copa Venezuela, women's league are `future/` issues, not branches.

## 5. Timeline reality check

Calendar assumes ~5–8 h/person/week. Phases will slip — that's fine. The rule that matters: **never let the repo go dark for more than a week**; sustained contribution history from three people is the CV asset. If time is short, shrink scope inside a phase, don't pause the project.

## 6. Licensing (decide in week 1, it's blocking for "open source")

- **Code:** MIT or Apache-2.0 (Apache-2.0 slightly better for CV-facing infra projects — patent grant, corporate-familiar).
- **Data:** you can't relicense scraped facts freely. Pragmatic stance: publish the *database* under **ODbL** or CC-BY-4.0 for data you compiled/derived (Wikipedia-sourced content is CC-BY-SA — track it separately), and clearly attribute upstream sources per dataset in `LICENSE-DATA`. When in doubt, publish the pipeline and let self-hosters materialize the data themselves — that's the strongest legal position and it makes the self-host story central rather than an afterthought.

## 7. First week, per person (start Monday)

| Who | Tasks |
|-----|-------|
| You | Repo + structure + CI skeleton; ADRs 0001–0005; DB schema draft; source audit for TheSportsDB (hit the API, save sample payloads into `docs/samples/`) |
| Edder | Source audit for Wikipedia + ligafutve.com; draft `data-dictionary.md` for `teams`/`matches`/`standings`; start the team-alias table from what he finds |
| Yuyo | docker-compose v0 (Postgres + placeholder poller); homelab namespace/VM prepared; Grafana stack up (even empty); GitHub Actions runner decision (hosted vs self-hosted) |
