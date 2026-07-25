# Data sources

**This document is filled in *before* code is written against a source.** No poller merges
without its entry here. Owner: whoever audits the source; Edder owns overall consistency.

Sample payloads live in `docs/samples/<source>/` so parsers have fixtures and reviewers can
see the real shape.

> **Audit status: complete, 2026-07-25.** Every claim below was verified by actually
> hitting the source on that date, not read from marketing copy. Remaining gaps are marked
> **OPEN** — chiefly unread terms of service, which gate publication but not development.

## Executive summary

| Source | Verdict | Use for |
|--------|---------|---------|
| **ligafutve.org** (SportsPress API) | ✅ **Best structured source** — but stale since 2025-07 | Match-level history 2021–2025, teams, players, venues |
| **Wikipedia** | ✅ Usable, uneven | Standings 1932–2026 (80 seasons); match results only 2008–09 onward (16 seasons) |
| **TheSportsDB** | ⚠️ Free key unusable; premium unverified | Nothing yet. Re-audit if premium is bought |
| **FVF** (fvf.com.ve) | ⚠️ News only | Context, verification, club metadata. No structured results |
| **APIfootball.com** | ✅ **Solves the current-season gap** | 2026 season, standings, deep history to 2005, livescores |
| **API-FOOTBALL** (api-sports.io) | ❌ Not pursued | Superseded by APIfootball.com — see the naming warning |
| **Sportmonks** | ❌ **Ruled out** | Nothing — FUTVE is not on the free tier |

**Update 2026-07-25 (second pass): the current-season gap is closed.** APIfootball.com
covers the 2026 season with match-level data, standings, and history back to 2005. The
remaining unknown is whether its livescores work for FUTVE specifically, which cannot be
tested until a FUTVE match is actually in progress.

## Confidence scale

| Level | Meaning |
|-------|---------|
| `high` | Official or federation source, or agreed by ≥2 independent sources |
| `medium` | Single reputable third party, no contradiction found |
| `low` | Single source, known to be incomplete or inconsistent; usable with a caveat |
| `disputed` | Sources disagree; both origins retained, resolution documented |

---

## ligafutve.org — official league site ✅

- **Audited:** 2026-07-25 · **Owner:** Edder · **Confidence:** `high`
- **Base URL:** `https://ligafutve.org`
- **⚠️ Domain warning:** the official site is **`.org`**. See the domain note below —
  `laligafutve.com` is no longer the league and must never be polled.

### The find: a public structured API

The site runs WordPress with the **SportsPress** plugin, which exposes a public REST API at
`https://ligafutve.org/wp-json/sportspress/v2` — **no authentication, no key, no scraping
required.**

| Endpoint | `X-WP-Total` |
|----------|--------------|
| `/events` | 1372 |
| `/players` | 1251 |
| `/teams` | 46 |
| `/venues` | 32 |
| `/seasons` | 25 |
| `/tables` | 24 |
| `/leagues` | 2 |

Events carry team IDs, per-team goals, win/loss outcome, venue, season and league terms,
plus player lineups and performance. Sample: `docs/samples/ligafutve/events.json`.

### Coverage — verified per season

| Season term | Events |
|-------------|--------|
| 2021 Fase Grupos | 253 |
| 2022 Fase Regular | 241 |
| 2023 Fase Regular | 225 |
| 2024 Apertura / Clausura | 91 / 118 |
| 2025 Apertura / Clausura | 117 / **27 (partial)** |
| **2026 Apertura** | **0** |

Event post dates run **2021-04-11 → 2025-07-25** and stop dead. The 2026 season *term*
exists (`id=327`) but returns zero events. **The feed has not been updated in roughly a
year.** Treat this as an excellent historical archive, not a live source, until proven
otherwise.

### Constraints

- **`robots.txt`:** `User-agent: *` with only WooCommerce/admin paths disallowed. Our paths
  are allowed. Sitemap at `/sitemap_index.xml`.
- **Rate limits:** none published. We commit to ≤1 req/s and conditional requests.
- **Scope hazard:** `/leagues` contains **two** competitions — `Liga FUTVE` (id 20) and
  `Liga FUTVE 2` (id 234). `/teams` includes reserve sides (`Zamora FC «B»`,
  `Monagas SC «B»`). **Filter to league 20 and exclude «B» teams**, or the scope guard
  (Primera only) is broken on day one.
- **Season naming** is free text and inconsistent across years: `Temporada 2021 Fase
  Grupos`, `Temporada 2022 Liga FUTVE Fase Regular`, `Torneo Apertura Temporada 2024 Fase
  Regular`, `Cuadrangular A - Torneo Apertura Temporada 2024`. This is direct input to the
  season-label decision in the data dictionary.
- **Licensing:** official site, no published API terms found. We publish factual results
  only — no page text, images or crests. **OPEN:** no ToS page was located; treat
  conservatively and revisit if one appears.

### ⚠️ Domain note — do not poll `laligafutve.com`

`laligafutve.com` was the league's old domain and is what TheSportsDB still records in its
`strWebsite` field. As of 2026-07-25 it resolves to an **Indonesian online-gambling site**
("MAXBET Situs Judi Bola"), not the league. `ligafutve.com` does not respond at all.

Two lessons worth keeping: a third-party API's metadata about a source can be years stale,
and a lapsed domain is an active hazard for a scraper. Any source URL we store gets
re-verified before use.

---

## Wikipedia ✅

- **Audited:** 2026-07-25 · **Owner:** Edder · **Confidence:** `medium` (`high` where it
  agrees with the official archive)
- **Access:** MediaWiki API (`https://en.wikipedia.org/w/api.php`), not HTML scraping.
  Batch up to ~25 titles per `action=query&prop=revisions` call — the full catalogue costs
  4 requests, not 80.

### Coverage — verified across all 80 season articles

Category `Venezuelan Primera División seasons` lists **80 articles, 1932 → 2026**.

| Data | Availability |
|------|--------------|
| Standings table (`{{#invoke:Sports table}}`) | **80 / 80 seasons** |
| Match-level results grid (`{{#invoke:Sports results}}`) | **16 / 80 seasons**, earliest **2008–09** |

Seasons **without** a results grid include everything before 2008–09 plus the gaps
**2013–14, 2014–15 and 2015**. Coverage also has holes in the early record: 1933–1939 and
1942–1950 have no article at all.

**Implication for Phase 1's "≥10 historical seasons":** trivially met for *standings*
(80 available). For *matches*, the ceiling is 16 seasons, and combining with the official
API (2021–2025) is the only way to get depth. Decide which the milestone means.

### Hazards

- **Three title conventions:** `1980 Venezuelan Primera División season`,
  `2010–11 Venezuelan Primera División season`, `2024 Liga FUTVE` (2018 onward). The
  scraper must handle all three; the en-dash in `2010–11` is U+2013, not a hyphen.
- **Format changes across eras:** calendar-year seasons → split `1986–87`…`2014–15` →
  calendar again from 2015, with Apertura/Clausura sub-tournaments. Confirmed present in
  both the 2010–11 and 2024 articles.
- **Old articles are thin:** the 1980 article is 3.3 KB (standings only); 2024 is 65 KB.
- Template invocation case varies (`sports table` vs `Sports table`) — match
  case-insensitively.

### Licensing

Article content is **CC BY-SA 4.0**. Anything derived from Wikipedia is tagged in the
database and tracked separately from the ODbL pool — see `LICENSE-DATA`. Requests send the
project `User-Agent` per MediaWiki etiquette.

Samples: `docs/samples/wikipedia/` (1980, 2010–11, 2024 wikitext).

---

## TheSportsDB ⚠️

- **Audited:** 2026-07-25 · **Owner:** Salvador · **Confidence:** `low` on the free tier
- **Base URL:** `https://www.thesportsdb.com/api/v1/json/{key}`
- **League ID `4513` confirmed:** `Venezuela Primera Division`, alternates
  `Liga Venezolana, Liga FUTVE`, country Venezuela, `strCurrentSeason: 2026`. Also
  cross-references `idAPIfootballv3: 299`, useful for the API-Football audit.

### The free test key `123` is not usable — verified

| Endpoint | Result |
|----------|--------|
| `lookupleague.php?id=4513` | ✅ Correct and complete league metadata |
| `eventsseason.php?id=4513&s=YYYY` | ⚠️ **Exactly 15 events for every season tried** (2020–2026) — a hard cap, not real coverage |
| `lookup_all_teams.php?id=4513` | ❌ **Returns the wrong league entirely** — 24 English clubs (Wigan, Blackpool, Leicester…) |
| `lookuptable.php?l=4513&s=2025` | ⚠️ Truncated to **4 rows** (the league has 14 teams) |
| `livescore.php?l=4513` | ❌ Ignores the league filter; returned 148 rows of basketball/baseball/soccer, **0 for FUTVE** |
| `eventsseason.php?id=4513&s=2019` | `null` — consistent with `dateFirstEvent: 2020-01-30` |
| `eventsnextleague.php?id=4513` | `null` |

The wrong-league team payload is the dangerous one: a poller that trusted it would silently
ingest English League One clubs as Venezuelan teams. **Any future TheSportsDB parser must
assert that returned teams belong to league 4513.**

### Consequences

- **No historical value.** Even on premium, `dateFirstEvent` is 2020-01-30 — Wikipedia and
  the official archive both go far deeper.
- **Premium (~€9/mo) is unevaluated.** The free tier's caps make it impossible to tell
  whether premium delivers real FUTVE livescores. Buying it is the only way to find out —
  that is the decision in issue #2, and it is a gamble, not a purchase.
- **ToS and rate limits: OPEN.** No limits were published in response headers (Cloudflare
  only). Terms must be read before any production use.

Samples: `docs/samples/thesportsdb/`.

---

## FVF — Federación Venezolana de Fútbol ⚠️

- **Audited:** 2026-07-25 · **Owner:** Edder · **Confidence:** `high` for anything it
  states, but it states little that is structured
- **Base URL:** `https://www.fvf.com.ve`
- **`robots.txt`:** a single `Sitemap:` line, no `Disallow`. Everything permitted.
- **Sitemap:** 1146 URLs, overwhelmingly news articles (`/articulos/...`) plus category
  pages (`/categoria/futve-masculina`, `liga-futve-femenina`, `liga-futve-futsal-1`,
  `liga-futve-junior`, `liga-futve-playa`).
- **No structured results, standings or fixtures** were found — this is a news site, not a
  data source.

**Use:** club metadata, disciplinary/administrative news (points deductions!), and as the
tiebreaker of last resort when sources disagree. Not a fact feed. Note the sitemap confirms
the women's, futsal, beach and junior competitions exist — all explicitly out of scope.

---

## Sportmonks ❌ ruled out

- **Audited:** 2026-07-25 · **Owner:** Salvador
- The free plan covers **only the Danish Superliga (id 271) and Scottish Premiership
  (id 501)**. FUTVE is not available at any free tier.
- Paid tiers would need evaluation on both cost and redistribution terms. Not worth it
  while the official archive is free and richer.

**Decision: closed. Do not integrate.**

---

## API-Football — **OPEN**

- **Owner:** Salvador · **Status:** blocked on account signup
- **Coverage is likely:** TheSportsDB cross-references Venezuela Primera as API-Football v3
  league **id 299**, so the league exists in their catalogue.
- **Free tier:** 100 requests/day, 10 requests/minute, all endpoints available — but
  **historical seasons are restricted on the free plan** and the exact allowed range is not
  documented publicly.
- **Redistribution terms unread.**

**To close this:** sign up for a free key, then verify (a) league 299 returns real
2026-season fixtures, (b) which seasons the free plan actually exposes, (c) whether
livescores work. That requires an account, so it needs Salvador, not an agent.

**This is currently the most promising candidate for the current-season gap.**

---

## Recommended architecture given the audit

1. **Current season (2026) and live data:** APIfootball.com, league 337. The only source
   with the current season, and the only plausible livescore feed.
2. **Historical match data 2021–2025:** ligafutve.org SportsPress API — official,
   structured, `high` confidence, and it overlaps APIfootball.com, which gives us two
   independent sources to cross-check against (exactly what ADR 0008's confidence model
   wants).
3. **Deep history:** APIfootball.com back to 2005 for matches; Wikipedia for standings back
   to 1932 and match results back to 2008–09.
4. **Verification:** FVF for administrative facts that change the table (deductions,
   awarded matches) — the things a results feed will never tell us.

Note the overlap this creates: 2021–2025 is covered by ligafutve.org, APIfootball.com and
Wikipedia simultaneously. That is a feature under the observations model (ADR 0008) and a
duplicate-row disaster without it.

## Source disagreements

When sources conflict, we record both origins and the resolution. Log non-obvious
resolutions here so the reasoning is reusable.

| Date | Fact | Sources & claims | Resolution | Rule derived |
|------|------|------------------|------------|--------------|
| 2026-07-25 | League's official website | TheSportsDB: `www.laligafutve.com` · Reality: `ligafutve.org` | TheSportsDB metadata is stale; the old domain now hosts a gambling site | Re-verify every source URL before polling; never trust a third party's link to a first party |
