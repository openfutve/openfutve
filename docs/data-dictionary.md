# Data dictionary

**Owner: Edder** (per the project plan — not yet onboarded; everything below is a draft by
Salvador awaiting his review).

The data contract: **no field enters Postgres without an entry here.** A migration that
adds a column and does not update this file does not get approved.

This file defines *meaning*. `packages/schema` defines *shape*. Where a definition involves
a judgement call ("what counts as form?", "when is a match final?"), the judgement is
recorded here, with the reasoning — that is the part nobody can recover from the schema.

## Observations, not facts (read this first)

Per [ADR 0008](adr/0008-provenance-observations-first.md), **Phase 1 stores what each source
claimed, not a resolved truth.** The tables named `*_observations` are **not deduplicated**:

> For 2021–2025, both ligafutve.org and Wikipedia cover the same fixtures, so the same real
> match appears **twice** — once per source. This is deliberate. It is not a bug, and it is
> not something to "fix" with a `DISTINCT`.

Canonical `matches` — one row per real fixture, resolved from observations — arrives in
Phase 2 alongside entity resolution. Until then, any query or endpoint must scope itself to
a single `source`, or knowingly work across claims.

Wikipedia carries `high` confidence, equal to the official feed. It is not a fallback: it is
the only source for everything before 2021, and where the two disagree we want to look
rather than defer. See ADR 0008 for why, and for the licensing cost of that choice.

## Provenance columns

Every fact table carries these. They are not optional and not nullable except where noted.

| Column | Type | Meaning |
|--------|------|---------|
| `source` | `text` FK → `sources.key` | Which source this row's facts came from. |
| `fetched_at` | `timestamptz` | When we retrieved the payload this row was parsed from — **not** when we wrote the row, and not when the event happened. |
| `confidence` | `confidence_level` | How much we trust this row. See scale in [`data-sources.md`](data-sources.md). |
| `ingested_at` | `timestamptz` | When our pipeline wrote the row. Defaults to `now()`. |
| `raw_payload_id` | `bigint` FK → `raw_payloads.id` | The exact stored bytes this row was parsed from. Nullable only for rows predating the poller framework. |

## Conventions

- All timestamps are `timestamptz`, stored in UTC. Match kickoff times are additionally
  recorded with the venue's local date (`match_date`) because "which matchday was that?" is
  a local-calendar question.
- Natural keys from sources are never used as primary keys. Every table has a surrogate
  `id`, plus a `source_ref` recording the source's own identifier.
- Enumerated values are Postgres enums, listed here in full. Adding a value is a migration
  *and* an edit to this file.
- `NULL` means "we don't know". It never means zero.

---

## `sources`

Registry of every data source. Referenced by every fact table.

| Column | Type | Definition |
|--------|------|------------|
| `key` | `text` PK | Stable short identifier, e.g. `thesportsdb`, `wikipedia`, `ligafutve`. |
| `name` | `text` | Human-readable name. |
| `base_url` | `text` | Root URL of the source. |
| `license_note` | `text` | Short statement of what we may publish from it. Long form lives in `LICENSE-DATA`. |
| `license` | `source_license` | Publication pool: `odbl-eligible`, `cc-by-sa`, `restricted`, `unknown`. Determines which export a fact may appear in. A source with `unknown` must not be published from. |
| `default_confidence` | `confidence_level` | Baseline trust; individual rows may override. |
| `active` | `boolean` | Whether we currently poll it. Only set true once the audit entry is complete **and** `license` is not `unknown`. |

## `teams`

A club. One row per club identity, not per name spelling.

| Column | Type | Definition |
|--------|------|------------|
| `id` | `uuid` PK | Surrogate key. |
| `canonical_name` | `text` | The name we display. To be chosen by the dictionary owner; see alias handling below. |
| `short_name` | `text` | Display abbreviation. |
| `founded_year` | `int` | Nullable — unknown for several historical clubs. |
| `city` | `text` | Nullable. |
| `source_ref` | `text` | The source's own id for this team. |
| + provenance columns | | |

**Open question (Edder):** how club renames, mergers and relocations are modelled. A club
that changes name is the same identity; a merger arguably is not. Until decided, the alias
table in `packages/shared` maps name variants → `teams.id`, and the hard cases are listed
in `docs/data-sources.md` under source disagreements.

## `players`

| Column | Type | Definition |
|--------|------|------------|
| `id` | `uuid` PK | Surrogate key. |
| `full_name` | `text` | As published. |
| `birth_date` | `date` | Nullable; needed for aging-curve analysis (Phase 4). |
| `position` | `text` | Nullable. Free text until we have enough data to justify an enum. |
| `source_ref` | `text` | |
| + provenance columns | | |

## `match_observations`

**One row per (source, fixture)** — *not* one row per fixture. Renamed from `matches`
by [ADR 0008](adr/0008-provenance-observations-first.md); canonical `matches` arrives in
Phase 2.

| Column | Type | Definition |
|--------|------|------------|
| `id` | `uuid` PK | |
| `season` | `text` | Season label as the league uses it, e.g. `2025`. **TODO (Edder):** decide the canonical form for apertura/clausura seasons. |
| `stage` | `text` | Nullable — e.g. regular phase, playoff round. |
| `matchday` | `int` | Nullable. |
| `kickoff_at` | `timestamptz` | Nullable — unknown for many historical matches, where only the date is published. |
| `match_date` | `date` | Local calendar date at the venue. |
| `home_team_id` / `away_team_id` | `uuid` FK → `teams` | |
| `home_score` / `away_score` | `int` | Nullable until the match is played. **Full-time score**, excluding any penalty shootout. |
| `status` | `match_status` | `scheduled`, `live`, `finished`, `postponed`, `cancelled`, `unknown`. |
| `venue` | `text` | Nullable. |
| `source_ref` | `text` | The source's own id for this fixture. |
| `match_key` | `text` | **Phase 2, unused in Phase 1.** Deterministic natural key grouping observations of the same real fixture across sources: `(season, home_team_id, away_team_id, match_date)` with a ±1 day window, since sources disagree on the calendar date of a late kickoff. |
| + provenance columns | | |

**Proposed definition — pending owner review:** `home_score`/`away_score` are the score at the end of regulation
plus any extra time, **excluding penalty shootouts**. Shootout results, when we have them,
are separate columns added later — a 1-1 draw decided on penalties is a draw for standings
purposes and must not become a 2-1.

## `match_event_observations`

Discrete events within a match, **as reported by one source**. Renamed from `match_events`
by ADR 0008. Sparse until we have a live source (Phase 3). Cross-source event merging is
out of scope until canonical matches exist.

| Column | Type | Definition |
|--------|------|------------|
| `id` | `uuid` PK | |
| `observation_id` | `uuid` FK → `match_observations` | The source's observation of the match this event belongs to. Events inherit that source's view of the fixture. |
| `type` | `match_event_type` | `goal`, `own_goal`, `penalty_goal`, `penalty_missed`, `yellow_card`, `red_card`, `second_yellow`, `substitution`, `other`. |
| `minute` | `int` | Nullable. Regulation minute. |
| `minute_extra` | `int` | Nullable. Added time beyond `minute`, e.g. 45+2 → `minute=45`, `minute_extra=2`. |
| `team_id` | `uuid` FK → `teams` | Team the event is attributed to. |
| `player_id` | `uuid` FK → `players` | Nullable — often unknown historically. |
| `related_player_id` | `uuid` FK → `players` | Nullable. Assist, or the player coming off in a substitution. |
| `detail` | `jsonb` | Source-specific extras. Not queried by the API; a staging ground for fields not yet promoted to columns. |
| + provenance columns | | |

**Note:** an own goal is attributed to the team that *benefits* via `team_id`? **TODO
(Edder): decide and state it here — this is exactly the kind of ambiguity that silently
corrupts aggregates.**

## `standings_snapshots`

Standings as observed at a point in time — a snapshot, not a derived view. We keep the
history so we can see what the table looked like on a given date, including when a source
later corrects it.

| Column | Type | Definition |
|--------|------|------------|
| `id` | `uuid` PK | |
| `season` | `text` | |
| `stage` | `text` | Nullable. |
| `observed_at` | `timestamptz` | When this standing was true according to the source. |
| `team_id` | `uuid` FK → `teams` | |
| `position` | `int` | |
| `played`, `won`, `drawn`, `lost` | `int` | |
| `goals_for`, `goals_against` | `int` | |
| `points` | `int` | As published by the source, **including any points deductions** — deductions are recorded in `points_adjustment` when known. |
| `points_adjustment` | `int` | Nullable. Administrative deductions/awards. |
| + provenance columns | | |

This table was already observation-shaped before ADR 0008, which generalized the same
instinct to matches and events.

**Why snapshots rather than a computed table:** the published standing and the standing our
own data implies can disagree (a deduction we don't know about, a match awarded 3-0). We
store what was published and compute our own separately, then reconcile. Discarding the
published value would hide exactly the discrepancies worth investigating.

---

## Pending definitions

Tracked here so they don't get decided implicitly in code.

| Term | Question | Owner | Needed by |
|------|----------|-------|-----------|
| Season label | Canonical form for apertura/clausura splits. Audit evidence and a proposed shape (`2024-A` / `2024-C`, everything else in `stage`) are in issue #6 | Edder | Phase 1 |
| Own goal attribution | Which team `team_id` points at | Edder | Phase 1 |
| Club identity | Renames vs mergers vs relocations | Edder | Phase 2 |
| Match identity | The `match_key` natural key and its ±1 day window (ADR 0008) | Salvador + Edder | Phase 2 |
| License basis | How a canonical row's publication pool is derived when observations come from both `odbl-eligible` and `cc-by-sa` sources | Salvador | Phase 2 |
| Form | Rolling window definition for live standings | Edder | Phase 3 |
