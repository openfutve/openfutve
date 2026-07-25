-- Seed the source registry. Confidence levels here are provisional and get
-- finalized by the Phase 0 audit in docs/data-sources.md.

INSERT INTO sources (key, name, base_url, license_note, default_confidence, active)
VALUES
  ('wikipedia',   'Wikipedia',
   'https://en.wikipedia.org',
   'CC BY-SA 4.0 — tracked separately from the ODbL pool. See LICENSE-DATA.',
   'medium', false),

  ('thesportsdb', 'TheSportsDB',
   'https://www.thesportsdb.com',
   'Normalized facts only; raw payloads are never republished. Pending ToS audit.',
   'medium', false),

  ('ligafutve',   'Liga FUTVE (official)',
   'https://ligafutve.com',
   'Official league source. Factual results only; no page text, images or crests.',
   'high', false),

  ('fvf',         'Federacion Venezolana de Futbol',
   'https://fvf.com.ve',
   'Official federation source. Factual results only. Pending ToS audit.',
   'high', false)
ON CONFLICT (key) DO NOTHING;

-- active = false everywhere on purpose: a source is only switched on once its
-- audit entry in docs/data-sources.md is complete.
