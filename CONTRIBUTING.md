# Contributing to openFutVE

## Working rhythm

**Whenever there's time and energy. No rush, no fixed cadence.**

There is no standing sync call and no sprint. People pick something up when they can and
put it down when they can't. A quiet fortnight is not a problem to escalate.

The one thing we do care about: **don't let a piece of work vanish silently.** If you've
claimed an issue and moved on, say so on the issue so someone else can pick it up. An
unowned issue is fine; a silently abandoned one wastes the next person's time.

The project board is the source of truth for what's in flight. Dates on the roadmap are
intent, not commitment — they will slip, and that's expected.

> The original plan called for a weekly sync and a rule against the repo going dark for
> more than a week, on the theory that sustained contribution history is the CV asset.
> That's been deliberately relaxed: a project that feels like an obligation gets abandoned
> outright, which is worse than an irregular one. Shrink scope inside a phase rather than
> forcing a schedule.

## Pull requests

Everything goes through a PR, including from maintainers.

**Reviews are the mentoring channel — write them like it.** Explain the *why*, not just
the *what*. If you're reviewing someone with less experience in an area, a review that
teaches is worth more than one that merely approves. If you're the one being reviewed,
saying "I'm not sure about this bit" in the PR description is a strength, not a weakness —
it tells the reviewer where to spend their attention.

Everyone reviews everyone. Being the most senior person on the repo doesn't exempt you from
having your work read.

## The rules that aren't negotiable

These exist because breaking them quietly corrupts the project's credibility:

1. **ADRs for anything structural.** See [`docs/adr/`](docs/adr/) and its template. If a
   decision constrains what future contributors can do, or would be expensive to reverse,
   it needs one.
2. **No field enters Postgres without an entry in
   [`docs/data-dictionary.md`](docs/data-dictionary.md).** A migration PR that adds columns
   and doesn't touch the dictionary doesn't get approved.
3. **No source gets polled before it's audited** in
   [`docs/data-sources.md`](docs/data-sources.md) — terms of service read, rate limits
   recorded, sample payloads committed.
4. **Scraping ethics** as stated in the [README](README.md): identify the bot, honour
   `robots.txt`, cache aggressively, never re-fetch to fix a parser.
5. **Raw payload first** ([ADR 0005](docs/adr/0005-raw-first-ingestion.md)). Parsers read
   from stored bytes, never from a live response.
6. **Secrets stay out of the repo.** `.env` is gitignored; `.env.example` carries
   placeholders only. Note that APIfootball.com accounts are individual — get your own key
   rather than reusing someone else's.

## Scope guard

**FUTVE Primera División only.**

Segunda División, Copa Venezuela, the women's league, futsal and beach football are all
real competitions that we are deliberately not doing. They are `future`-labelled issues,
not branches. Several of our sources return them in the same endpoints, so filtering is an
active task, not an assumption — see the scope hazards in `docs/data-sources.md`.

## Getting started

```bash
git clone https://github.com/openfutve/openfutve.git
cd openfutve
cp .env.example .env
docker compose -f infra/compose/docker-compose.yml up   # Postgres + migrations + seeds
pnpm install && pnpm build                              # JS side
```

Good first issues are labelled by area (`area:data`, `area:infra`, `area:analysis`) and by
phase. If you're new to the project, read [ADR 0005](docs/adr/0005-raw-first-ingestion.md)
and [ADR 0008](docs/adr/0008-provenance-observations-first.md) first — between them they
explain why the schema looks the way it does.
