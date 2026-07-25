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
| `season` | `text` | Canonical season label — **our** form, not the source's. See the rule below. |
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

### Season label — decided 2026-07-25

Sources disagree wildly (`Temporada 2021 Fase Grupos`, `Torneo Apertura Temporada 2024 Fase
Regular`, `2010–11 Venezuelan Primera División season`), so we normalise to a form that
sorts and joins:

| Case | `season` | `stage` |
|------|----------|---------|
| Calendar year, no split | `2021` | `Fase Regular` |
| Apertura | `2024-A` | `Fase Regular`, `Cuadrangular A`, … |
| Clausura | `2024-C` | as above |
| Cross-year season (pre-2016) | `1986-87` | as published |

The rule: **`season` carries the year and the tournament, nothing else. Everything more
granular goes in `stage`.** That keeps `season` short, lexically sortable, and safe to group
by — the thing analysis needs — while `stage` absorbs the phase names that vary by year and
source. Cross-year labels use an ASCII hyphen, never the en-dash Wikipedia uses.

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

### Own goal attribution — decided 2026-07-25

**`team_id` is the team the goal COUNTS FOR — the beneficiary, not the scorer's team.**

So for an own goal, `team_id` and `player_id`'s club are **deliberately different**: the
player belongs to the conceding side, the goal belongs to the other.

Why this way round: it makes the obvious query correct. `SUM(...) GROUP BY team_id` yields
goals-for without anyone needing to remember to invert `own_goal` rows. The alternative —
attributing to the scorer's team — is arguably more natural to read but silently produces
wrong aggregates the first time someone forgets the special case, and that error is
invisible in the output.

Consequence to keep in mind: a query joining `match_event_observations.player_id` to a
squad list and grouping by `team_id` will look inconsistent for own goals. That is correct
behaviour, not a bug.

## `team_season_observations`

**Which division a club played in, for a given season, as claimed by one source.**
Added by [ADR 0009](adr/0009-team-season-membership.md).

Clubs are promoted and relegated, so division membership is a fact about a
**(club, season)** pair, never about a club alone. Aragua FC is Primera in
2021–2023 and Segunda in 2026, and both are correct.

| Column | Type | Definition |
|--------|------|------------|
| `id` | `uuid` PK | |
| `team_id` | `uuid` FK → `teams` | |
| `season` | `text` | Season label in the canonical form above (`2021`, `2024-A`). Membership is **per tournament** where a split exists — a club can be admitted or excluded between Apertura and Clausura. |
| `division` | `division` | `primera`, `segunda`, `other` (cup/reserve/youth), `unknown` (the source did not say — do not assume). |
| `source_ref` | `text` | The source's own handle on this membership: a season term id, a league id. |
| + provenance columns | | |

**What it is for.** Scope filtering — "is this fixture a Primera match?" — is a
join against this table, not a guess. A fixture is in scope when **both** clubs
were `primera` for that season. Before this existed, scope rested on a static
club list that was wrong the moment anyone was promoted, and on the alias table
failing to recognise out-of-scope clubs, which is not a filter so much as an
accident.

**Not deduplicated across sources**, per ADR 0008 — sources can disagree about
who was in a division, particularly around administrative relegations, and we
want that visible. The `UNIQUE (source, team_id, season)` constraint only stops a
single source contradicting itself.

**Derived, not curated.** ligafutve.org season terms name the division outright
(`Liga FUTVE` vs `Liga FUTVE 2`); standings snapshots are a per-season roster by
construction; Wikipedia extends the record back to 1932.

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
| ~~Season label~~ | **Decided 2026-07-25** — see above | Salvador | ✅ |
| ~~Own goal attribution~~ | **Decided 2026-07-25** — beneficiary, see above | Salvador | ✅ |
| Club identity | Renames vs mergers vs relocations | Edder | Phase 2 |
| Match identity | The `match_key` natural key and its ±1 day window (ADR 0008) | Salvador + Edder | Phase 2 |
| Division for cups | Whether Copa Venezuela participation is `other` or simply absent from membership | Edder | Phase 2 |
| License basis | How a canonical row's publication pool is derived when observations come from both `odbl-eligible` and `cc-by-sa` sources | Salvador | Phase 2 |
| Form | Rolling window definition for live standings | Edder | Phase 3 |
