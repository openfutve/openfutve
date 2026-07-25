# ADR 0008 — Provenance: observations first, canonical facts later

- **Status:** Accepted
- **Date:** 2026-07-25
- **Deciders:** Salvador

## Context

The Phase 0 source audit (`docs/data-sources.md`) broke an assumption the initial schema was
built on: that each fact has exactly one source.

Actual coverage overlaps:

| Years | Match data available from |
|-------|---------------------------|
| 2008–2020 | Wikipedia only |
| **2021–2025** | **ligafutve.org (official API) *and* Wikipedia** |
| 2026 | no confirmed source yet |

With `UNIQUE (source, source_ref)` on `matches`, the same real-world fixture becomes two
rows for 2021–2025. `GET /matches` would serve duplicates, aggregates would double-count,
and `match_events` would have no single match to attach to. The schema had no answer to
"which row is the truth?".

Three distinct problems hide inside that question:

1. **Identity.** The sources share no key. Matching them requires a deterministic natural
   key — `(season, home_team_id, away_team_id, match_date)` after entity resolution — with a
   ±1 day window, because sources disagree on the calendar date of a late kickoff. This
   depends on the team alias table existing first.
2. **Resolution.** When two sources disagree on a score, what do we serve, and what do we
   keep?
3. **Licensing.** `LICENSE-DATA` publishes the compiled database under ODbL while tracking
   Wikipedia-derived content separately as CC BY-SA. A fact resolved from both sources
   belongs to both pools. Without per-row provenance, we cannot produce a clean ODbL export
   at all — this is a legal obligation, not a nicety.

## Decision

**Phase 1 stores observations only. Canonical facts are deferred to Phase 2.**

```
raw_payloads             what a source literally sent          (ADR 0005, exists)
match_observations       what a source claimed, parsed         ← Phase 1 write target
matches                  our resolved view of a fixture        ← Phase 2
```

Concretely:

- `matches` is renamed to **`match_observations`**, and `match_events` to
  **`match_event_observations`**. The tables were already observation-shaped — carrying
  `source`, `source_ref`, `fetched_at` and `confidence`, keyed by `(source, source_ref)` —
  so this is mostly an honest renaming of what they always were.
- Every observation links to the `raw_payloads` row it was parsed from, so any fact traces
  to the exact bytes that produced it.
- **No deduplication in Phase 1.** Two sources covering the same fixture produce two rows,
  deliberately.
- `apps/api` serves a single chosen source per query in Phase 1 and does not pretend to
  resolve. The API's shape changes once, in Phase 2, when canonical `matches` arrives.
- `standings_snapshots` is unchanged — it was already designed this way, storing what a
  source published rather than a computed table. This ADR generalizes that instinct to the
  rest of the schema.
- `sources` gains a **`license`** column (`odbl-eligible`, `cc-by-sa`, `restricted`,
  `unknown`) so the licensing pool of any row is derivable today, before canonicalization
  makes it complicated.

### Trust: Wikipedia is a peer, not a fallback

Wikipedia carries `high` confidence, equal to the official feed, rather than the `medium`
the audit initially proposed. Reasons:

- The season articles are carefully maintained and internally consistent, and they are the
  **only** source for everything before 2021 — the majority of the corpus.
- The "official" feed is not obviously more reliable in practice: it stopped publishing in
  July 2025, its season labels are inconsistent free text, and it mixes Liga FUTVE 2 and
  reserve sides into the same endpoints.
- Treating the official source as automatically authoritative would encode a hierarchy we
  have no evidence for. Where they disagree we want to look, not to defer.

Phase 2 resolution therefore treats agreement between independent sources as the confidence
signal, rather than ranking sources against each other. Disagreements are recorded in both
directions and surfaced, never silently dropped.

## Alternatives considered

- **Single canonical table, precedence wins on write.** One `matches` row; official beats
  Wikipedia. Simplest, no new tables. Rejected: it discards the disagreements, which are
  the most analytically interesting thing we have; it contradicts the `standings_snapshots`
  design already in the schema; and it makes the licensing question unanswerable, since a
  row's origin is overwritten.
- **Full two-layer model in Phase 1.** Correct from day one, and the API never changes
  shape. Rejected on sequencing: it front-loads entity resolution — the alias table, the
  ±1 day matching window, the disagreement log — into the phase whose stated purpose is to
  ship something real and *feel the pain* before justifying machinery. Resolution belongs
  next to Flink entity resolution in Phase 2, where the same alias table serves both.
- **Generic `fact_provenance` side table.** One provenance table referencing any fact by
  type and id. More flexible, but loses foreign keys and type safety, and nothing in our
  domain needs that generality at six tables.

## Consequences

- **The API changes shape once, in Phase 2.** Accepted and planned, not a surprise. Phase 1
  consumers must expect `/matches` to be source-scoped.
- **Duplicate-looking data is a feature in Phase 1.** Anyone reading the database directly
  will see the same fixture twice for 2021–2025. This must be documented in the data
  dictionary and in the API docs, or it reads as a bug.
- **Trusting Wikipedia as a peer enlarges the CC BY-SA pool.** More of the corpus is
  share-alike-encumbered than if we had ranked the official feed above it. That is a real
  cost of this decision, accepted because coverage and honesty matter more than the size of
  the ODbL pool. `LICENSE-DATA` already anticipates the split.
- Phase 2 must deliver: the natural key and matching window, canonical `matches`, a
  `license_basis` derived from contributing observations, a derived confidence, and a
  disagreement log. That is a substantial chunk of Phase 2 scope and should be budgeted as
  such.
- `match_event_observations` hangs off an observation, so events inherit whichever source's
  view of the fixture they came from. Cross-source event merging is explicitly out of scope
  until canonical matches exist.
