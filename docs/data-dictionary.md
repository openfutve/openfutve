# Data dictionary

**Owner: Edder.**

The data contract: **no field enters Postgres without an entry here.** A migration that
adds a column and does not update this file does not get approved.

This file defines *meaning*. `packages/schema` defines *shape*. Where a definition involves
a judgement call ("what counts as form?", "when is a match final?"), the judgement is
recorded here, with the reasoning — that is the part nobody can recover from the schema.

## Provenance columns

Every fact table carries these. They are not optional and not nullable except where noted.

| Column | Type | Meaning |
|--------|------|---------|
| `source` | `text` FK → `sources.key` | Which source this row's facts came from. |
| `fetched_at` | `timestamptz` | When we retrieved the payload this row was parsed from — **not** when we wrote the row, and not when the event happened. |
| `confidence` | `confidence_level` | How much we trust this row. See scale in [`data-sources.md`](data-sources.md). |
| `ingested_at` | `timestamptz` | When our pipeline wrote the row. Defaults to `now()`. |

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
| `default_confidence` | `confidence_level` | Baseline trust; individual rows may override. |
| `active` | `boolean` | Whether we currently poll it. |

## `teams`

A club. One row per club identity, not per name spelling.

| Column | Type | Definition |
|--------|------|------------|
| `id` | `uuid` PK | Surrogate key. |
| `canonical_name` | `text` | The name we display. Chosen by Edder; see alias handling below. |
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

## `matches`

One row per fixture.

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
| `source_ref` | `text` | |
| + provenance columns | | |

**Definition (Edder):** `home_score`/`away_score` are the score at the end of regulation
plus any extra time, **excluding penalty shootouts**. Shootout results, when we have them,
are separate columns added later — a 1-1 draw decided on penalties is a draw for standings
purposes and must not become a 2-1.

## `match_events`

Discrete events within a match. Sparse until we have a live source (Phase 3).

| Column | Type | Definition |
|--------|------|------------|
| `id` | `uuid` PK | |
| `match_id` | `uuid` FK → `matches` | |
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

**Why snapshots rather than a computed table:** the published standing and the standing our
own data implies can disagree (a deduction we don't know about, a match awarded 3-0). We
store what was published and compute our own separately, then reconcile. Discarding the
published value would hide exactly the discrepancies worth investigating.

---

## Pending definitions

Tracked here so they don't get decided implicitly in code.

| Term | Question | Owner | Needed by |
|------|----------|-------|-----------|
| Season label | Canonical form for apertura/clausura splits | Edder | Phase 1 |
| Own goal attribution | Which team `team_id` points at | Edder | Phase 1 |
| Club identity | Renames vs mergers vs relocations | Edder | Phase 2 |
| Form | Rolling window definition for live standings | Edder | Phase 3 |
