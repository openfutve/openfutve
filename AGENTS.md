# AGENTS.md

Instructions for AI agents and a quick reference for humans. Read this before
changing anything; [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the human process.

## What this project is

An open data platform for Venezuelan football (Liga FUTVE). Pollers ingest from
several sources into Postgres, a public API serves it, and analysis is published
with its notebook attached. The pipeline is the product — self-hosting is a
supported path, not an afterthought.

## Conventions

### Commits

**[Conventional Commits](https://www.conventionalcommits.org/).** Format:

```
<type>(<scope>): <description>

<body — the why, not the what>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`,
`revert`. Breaking changes take a `!` before the colon (`feat(db)!: …`).

Scopes are the thing you touched: `pollers`, `api`, `web`, `db`, `shared`,
`schema`, `compose`, `ci`, `docs`, `streaming`, `tools`.

```
feat(pollers): add rate-limited fetcher with robots.txt support
fix(db): correct down migration for the observations rename
docs(adr): record the provenance model as ADR 0008
```

Write bodies that explain **why**, and say what you verified. A reader in six
months has the diff already; what they lack is the reasoning.

### Branches

`<type>/<short-kebab-description>`, same types as commits:

```
feat/poller-framework
fix/standings-down-migration
docs/source-audit
```

Never commit directly to `main`. Everything goes through a pull request,
including from maintainers.

## The non-negotiables

Breaking these quietly damages the project's credibility, so several are
enforced in code rather than trusted to review:

1. **ADRs for anything structural.** [`docs/adr/`](docs/adr/) — if a decision
   constrains future contributors or is expensive to reverse, write one.
2. **No column without a data-dictionary entry.** A migration PR that doesn't
   touch [`docs/data-dictionary.md`](docs/data-dictionary.md) doesn't merge.
3. **No source polled before it's audited** in
   [`docs/data-sources.md`](docs/data-sources.md) — ToS read, rate limits
   recorded, sample payloads committed. *Enforced:* `assertSourcePollable()`
   refuses a source whose licence is `unknown` or which is not `active`.
4. **Raw payload first** ([ADR 0005](docs/adr/0005-raw-first-ingestion.md)).
   Parsers read stored bytes, never a live response. *Enforced:* a poller's only
   route to the network is `ctx.fetchAndStore()`, which archives before parsing
   and returns the `raw_payload_id` every derived row must carry.
5. **Identify the bot, honour robots.txt, rate limit.** *Enforced:* `Fetcher`
   throws without a `User-Agent`; the framework owns rate limiting so no
   individual poller can opt out.
6. **Observations, not facts** ([ADR 0008](docs/adr/0008-provenance-observations-first.md)).
   Pollers write to `match_observations`. Multiple sources covering the same
   fixture produce multiple rows — deliberately. Canonical `matches` is Phase 2.
7. **Secrets never enter the repo.** `.env` is gitignored; `.env.example` holds
   placeholders. APIfootball.com accounts are individual per their terms — no
   shared key in CI, deploys, or between contributors.
8. **Scope guard: FUTVE Primera División only.** Segunda, Copa Venezuela, the
   women's league, futsal and beach football are `future` issues. Several
   sources return them from the same endpoints, so filtering is active work.

## Commands

```bash
pnpm install
pnpm build          # turbo: tsc across the workspace
pnpm typecheck
pnpm test           # node:test
pnpm lint

# full stack: Postgres + migrations + seeds + poller
docker compose -f infra/compose/docker-compose.yml up
docker compose -f infra/compose/docker-compose.yml down -v   # reset

# run a poller directly
node apps/pollers/dist/index.js <name> [--dry-run] [--force] [--allow-unaudited]
```

Migrations are plain SQL applied by dbmate, in `packages/db/db/migrations`.
They are **append-only** — never edit a merged one — and every `down` must work.

## Notes for agents specifically

- **Verify, don't assert.** Claims in this repo are expected to be backed by a
  command you actually ran. `docs/data-sources.md` records what each source
  returned on a given date, not what its marketing said.
- **Don't invent data.** If a source's terms, limits or coverage are unknown,
  write `OPEN` and say so. An unfilled row is not permission.
- **Sources lie about themselves.** TheSportsDB still lists a league website
  that now hosts a gambling site; APIfootball.com and API-FOOTBALL are different
  companies with confusingly similar names. Re-check URLs before using them.
- **Prefer failing loudly.** Entity resolution returns `undefined` for unknown
  names rather than guessing, because a wrong resolution is far more expensive
  than a missing one.
- Node's `--experimental-strip-types` needs `.ts` import specifiers;
  `rewriteRelativeImportExtensions` converts them on emit. Import `./foo.ts`,
  not `./foo.js`.
