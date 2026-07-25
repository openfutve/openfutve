# ADR 0009 — Division membership is a fact about a club *and a season*

- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Salvador

## Context

Clubs are promoted and relegated. "Is this club in the Primera División?" has no
answer on its own — only "was this club in the Primera División **in season X**"
does. Nothing in the schema modelled that: `teams` is a flat dimension of name,
city and founded year, with no notion of division at all.

Two static approximations filled the gap, and both failed in practice:

1. **The alias table's two buckets** in `packages/shared` — `TEAM_ALIASES`
   ("currently Primera") and `HISTORICAL_TEAM_ALIASES` ("used to be"). A snapshot
   that started drifting immediately: Trujillanos was promoted for 2026 and had
   to be hand-noted.
2. **Per-source scope filters.** ligafutve.org's league term is trustworthy;
   APIfootball's `league_id` is not — it labels 39 of 184 fixtures for 2026 as
   "Primera División" when they are second-division or reserve-side matches.

Because APIfootball has no reliable signal, scope filtering there ended up
resting on an accident: mislabelled fixtures were excluded only because the alias
table did not recognise their clubs. That coupled two jobs that pull in opposite
directions — identity resolution wants to know *every* club that ever existed,
while a scope guard built from ignorance wants to know as few as possible.

The conflict is not hypothetical. Adding five genuine former top-flight clubs to
the alias table would recover roughly 280 matches from the 2021–2023 archive.
Attempting it produced:

```
resolveTeamName("Aragua")  ->  "Aragua FC"
```

`Aragua` is what APIfootball calls a **2026 second-division club**, in fixtures it
mislabels as Primera. Suffix normalisation collapses `Aragua FC` and `Aragua` onto
one key, so the alias would silently admit second-division matches into the
top-flight record. Restricting the addition to official spellings does not help —
that *was* the attempt. The additions were reverted and the archive shipped
incomplete, because missing data beats wrong data.

The underlying defect is that `resolveTeamName(name)` is being asked a question
that has no season in it.

## Decision

Model division membership as an observation about a **(club, season)** pair.

```sql
team_season_observations (team_id, season, division, + provenance)
```

- **Scope becomes a join, not a guess.** A fixture belongs to the Primera for a
  season when both clubs were in the Primera *that season*.
- **The alias table becomes purely identity resolution**, free to know every club
  that ever played, because scope no longer depends on its ignorance.
- **Promotion and relegation become queryable facts** rather than something
  implicit in which list a club appears on.

It is an **observation** table, per [ADR 0008](0008-provenance-observations-first.md):
sources can disagree about who was in a division, so we record what each claimed
and defer canonical resolution to Phase 2 along with everything else.

### Derived, not curated

The membership data already exists inside what we ingest, so this is not a
hand-maintained list that goes stale the way the alias table did:

- **ligafutve.org** season terms name the division outright (`Liga FUTVE` versus
  `Liga FUTVE 2`), and events link teams to season terms — so 2021–2025
  membership falls out of the 871 archived matches.
- **standings snapshots** are a per-season roster by construction.
- **Wikipedia** (#12) extends the record back to 1932.

## Alternatives considered

- **Keep the static lists, curate harder.** Rejected: it is already wrong after
  one season, and every future promotion silently corrupts scope until someone
  notices. It also cannot represent Aragua, which is legitimately Primera in 2021
  and Segunda in 2026.
- **Season-scoped resolution — `resolveTeamName(name, season)`.** Closer, but it
  buries a data question inside a string-matching function and leaves the
  membership facts undiscoverable and unqueryable. This ADR keeps the same
  benefit while making the data first-class.
- **Per-source hardcoded exclusion lists.** Fastest fix, and it treats the symptom
  in the one place it currently hurts. Rejected because the list needs updating
  every season, by someone who happens to remember, and analysts cannot see it.
- **A `division` column on `teams`.** Simplest schema change, and wrong for the
  same reason a static list is wrong: it can hold only one answer for a club with
  a history.

## Consequences

- **Pollers gain a second write target.** Both existing pollers, and the Wikipedia
  backfill, must record membership alongside matches. That work is follow-up, not
  part of this ADR.
- **Scope filtering has to be rewritten** in both pollers to join against
  membership instead of relying on alias-table ignorance. Until that lands, the
  current filters stay as they are — this ADR does not silently change what is
  ingested.
- **The alias table can then be expanded** (#13), unblocking the ~280 matches this
  cost us, plus whatever the Wikipedia backfill finds.
- **A chicken-and-egg case exists:** the very first season ingested from a source
  has no membership data yet. Bootstrapping is per-source — ligafutve's season
  terms give it directly, while APIfootball needs its standings fetched first.
- **Sources will disagree** about who was in which division, especially around
  administrative relegations. That is the intended behaviour of an observation
  table, and it makes the disagreements visible rather than fatal.
- Seasons use the labels from `docs/data-dictionary.md` (`2024-A`, `2021`), so
  membership is per *tournament* where a split exists. That is deliberate: a club
  can be admitted or excluded between Apertura and Clausura.
