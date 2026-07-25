-- Seed the source registry. Confidence and licensing reflect the Phase 0 audit
-- completed 2026-07-25 — see docs/data-sources.md.

INSERT INTO sources (key, name, base_url, license_note, default_confidence, license, active)
VALUES
  -- ADR 0008: Wikipedia is a peer of the official feed, not a fallback. It is
  -- the only source for everything before 2021, and its season articles are
  -- more internally consistent than the official feed's free-text seasons.
  ('wikipedia',   'Wikipedia',
   'https://en.wikipedia.org',
   'CC BY-SA 4.0 — share-alike, tracked separately from the ODbL pool. See LICENSE-DATA.',
   'high', 'cc-by-sa', false),

  -- Official league site. NOTE: .org. The old .com domain now hosts an
  -- unrelated gambling site — see docs/data-sources.md.
  ('ligafutve',   'Liga FUTVE (official)',
   'https://ligafutve.org',
   'Official league source, SportsPress REST API. Factual results only; no page text, images or crests.',
   'high', 'odbl-eligible', false),

  ('fvf',         'Federacion Venezolana de Futbol',
   'https://www.fvf.com.ve',
   'Official federation source. News only — no structured results. Used for administrative facts and verification.',
   'high', 'odbl-eligible', false),

  -- Free tier proven unusable (15-event cap, wrong-league team payloads).
  -- Kept registered so the audit trail has somewhere to point.
  ('thesportsdb', 'TheSportsDB',
   'https://www.thesportsdb.com',
   'ToS unread; free tier unusable. Do not publish anything sourced here until audited.',
   'low', 'unknown', false)
ON CONFLICT (key) DO UPDATE SET
  name               = EXCLUDED.name,
  base_url           = EXCLUDED.base_url,
  license_note       = EXCLUDED.license_note,
  default_confidence = EXCLUDED.default_confidence,
  license            = EXCLUDED.license;

-- Sportmonks is deliberately absent: the free tier covers only the Danish and
-- Scottish leagues, so it was ruled out before integration (docs/data-sources.md).

-- active = false everywhere on purpose: a source is only switched on once its
-- audit entry in docs/data-sources.md is complete AND its license is not 'unknown'.
