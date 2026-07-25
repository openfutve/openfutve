# Data sources

**This document is filled in *before* code is written against a source.** No poller merges
without its entry here. Owner: whoever audits the source; Edder owns overall consistency.

For each source we record: what it is, terms of service, rate limits, what fields it
actually gives us for FUTVE, and how much we trust it. Sample payloads go in
`docs/samples/<source>/` so parsers have fixtures and reviewers can see the real shape.

> **Status: audit in progress (Phase 0).** Every `TODO` below is an open question, not an
> omission. Do not treat an unfilled row as "no limit" or "permitted".

## Confidence scale

| Level | Meaning |
|-------|---------|
| `high` | Official or federation source, or agreed by ≥2 independent sources |
| `medium` | Single reputable third party, no contradiction found |
| `low` | Single source, known to be incomplete or inconsistent; usable with a caveat |
| `disputed` | Sources disagree; both origins retained, resolution documented |

## Audit checklist (per source)

- [ ] Base URL and the exact endpoints/pages we would use
- [ ] Terms of service — link, date read, and the clauses that matter (automated access,
      redistribution, attribution)
- [ ] `robots.txt` — link, and what it allows for our paths
- [ ] Rate limits — published, or the self-imposed limit we commit to
- [ ] Auth: key required? free tier? paid tier cost and what it unlocks
- [ ] FUTVE coverage actually verified by hitting it — not assumed from marketing copy
- [ ] Historical depth: earliest season with usable data
- [ ] Fields provided, mapped to our `data-dictionary.md` entries
- [ ] Sample payload committed to `docs/samples/<source>/`
- [ ] Confidence level assigned, with reasoning

---

## TheSportsDB

- **What:** Community-maintained sports database with a free JSON API.
- **Owner of audit:** Salvador
- **League ID:** `4513` (to be confirmed as FUTVE Primera División)
- **Base URL:** TODO
- **Auth:** Free public test key `123`; premium tier (~€9/mo) documented as unlocking
  livescores. **TODO: verify what key `123` actually returns for league 4513** — fixtures,
  results, squads? And whether livescores genuinely cover FUTVE before paying.
- **ToS:** TODO — read and record; note redistribution stance (see `LICENSE-DATA`)
- **Rate limits:** TODO
- **Historical depth:** TODO
- **Fields:** TODO
- **Samples:** `docs/samples/thesportsdb/` — TODO
- **Confidence:** TODO
- **Blocking decision:** the premium tier is a Phase 0 output — Phase 3 (live matches)
  depends on having *some* livescore source.

## Wikipedia

- **What:** Season pages for Venezuelan Primera División — league tables, results grids.
- **Owner of audit:** Edder
- **Base URL:** TODO (article naming pattern per season)
- **Auth:** None. Use the MediaWiki API rather than scraping rendered HTML where possible.
- **ToS / licensing:** Content is CC BY-SA 4.0 — **tracked separately from ODbL data**, see
  `LICENSE-DATA`. TODO: confirm attribution mechanics for derived tables.
- **Rate limits:** TODO — record the MediaWiki API etiquette rules and our `User-Agent`.
- **Historical depth:** The main backfill source. TODO: earliest season with a usable table.
- **Known hazards:** team names change across decades (renames, mergers, relocations);
  table formats are inconsistent between seasons; some seasons use apertura/clausura
  splits. This is what feeds the alias table.
- **Samples:** `docs/samples/wikipedia/` — TODO
- **Confidence:** TODO (expected `medium`, `high` where it agrees with FVF)

## ligafutve.com

- **What:** Official league site.
- **Owner of audit:** Edder
- **Base URL:** TODO
- **Auth:** None expected.
- **ToS:** TODO
- **`robots.txt`:** TODO — **check before any fetch**
- **Rate limits:** None published expected; we commit to ≤1 req/s and aggressive caching.
- **Structure:** TODO — inspect HTML; is there an underlying JSON endpoint?
- **Historical depth:** TODO
- **Samples:** `docs/samples/ligafutve/` — TODO
- **Confidence:** expected `high` for current-season facts (official source).

## FVF (Federación Venezolana de Fútbol)

- **What:** National federation site.
- **Owner of audit:** Edder
- **Base URL:** TODO
- **ToS / `robots.txt` / rate limits:** TODO
- **Structure:** TODO — inspect HTML; note if results live in PDFs
- **Samples:** `docs/samples/fvf/` — TODO
- **Confidence:** expected `high`, used to arbitrate disputes.

## Sportmonks

- **What:** Commercial football data API with a free tier.
- **Owner of audit:** Salvador
- **Auth:** Free tier — **TODO: verify FUTVE is in the free tier's league coverage.** Free
  tiers commonly cover only a handful of European leagues.
- **ToS:** TODO — free-tier redistribution is typically restricted; if so we use it for
  cross-checking only and do not publish its facts. Record the exact clause.
- **Rate limits:** TODO
- **Confidence:** TODO
- **Decision:** likely verification-only, pending the ToS read.

## API-Football

- **What:** Commercial football data API with a free tier.
- **Owner of audit:** Salvador
- **Auth:** Free tier with a daily request cap. **TODO: verify Venezuela coverage on the
  free tier** before building anything.
- **ToS:** TODO — same redistribution question as Sportmonks.
- **Rate limits:** TODO
- **Confidence:** TODO
- **Decision:** likely verification-only, pending the ToS read.

---

## Source disagreements

When sources conflict on a fact, we record both origins and the resolution. Log
non-obvious resolutions here so the reasoning is reusable.

| Date | Fact | Sources & claims | Resolution | Rule derived |
|------|------|------------------|------------|--------------|
| — | — | — | — | — |
