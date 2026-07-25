-- migrate:up
--
-- ADR 0008: Phase 1 stores what each source claimed, not a resolved truth.
-- The tables were already observation-shaped (source, source_ref, fetched_at,
-- confidence, keyed by (source, source_ref)) — this names them honestly and
-- adds the links needed to trace and license every row.
--
-- Canonical `matches` arrives in Phase 2, alongside entity resolution.

-- ---------------------------------------------------------------------------
-- sources: licensing pool must be derivable per row, today
-- ---------------------------------------------------------------------------

CREATE TYPE source_license AS ENUM (
  'odbl-eligible',  -- facts we may publish in the ODbL pool
  'cc-by-sa',       -- share-alike, tracked separately (Wikipedia)
  'restricted',     -- verification only; not republished
  'unknown'         -- audit incomplete; do not publish
);

ALTER TABLE sources
  ADD COLUMN license source_license NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN sources.license IS
  'Which publication pool facts from this source belong to. See LICENSE-DATA.';

-- ---------------------------------------------------------------------------
-- matches -> match_observations
-- ---------------------------------------------------------------------------

ALTER TABLE matches RENAME TO match_observations;

ALTER INDEX matches_season_idx RENAME TO match_observations_season_idx;
ALTER INDEX matches_home_team_idx RENAME TO match_observations_home_team_idx;
ALTER INDEX matches_away_team_idx RENAME TO match_observations_away_team_idx;
ALTER INDEX matches_status_idx RENAME TO match_observations_status_idx;

-- Trace every parsed fact back to the exact bytes it came from (ADR 0005).
ALTER TABLE match_observations
  ADD COLUMN raw_payload_id bigint REFERENCES raw_payloads (id);

-- Phase 2 fills this: the deterministic natural key used to group observations
-- of the same real fixture across sources. Nullable and unused in Phase 1.
ALTER TABLE match_observations
  ADD COLUMN match_key text;

CREATE INDEX match_observations_match_key_idx
  ON match_observations (match_key) WHERE match_key IS NOT NULL;

COMMENT ON TABLE match_observations IS
  'What a single source claimed about a fixture. NOT deduplicated: the same '
  'real match appears once per source that covers it. Canonical matches are '
  'resolved in Phase 2 (ADR 0008).';

-- ---------------------------------------------------------------------------
-- match_events -> match_event_observations
-- ---------------------------------------------------------------------------

ALTER TABLE match_events RENAME TO match_event_observations;

ALTER TABLE match_event_observations RENAME COLUMN match_id TO observation_id;

ALTER INDEX match_events_match_idx RENAME TO match_event_observations_obs_idx;

ALTER TABLE match_event_observations
  ADD COLUMN raw_payload_id bigint REFERENCES raw_payloads (id);

COMMENT ON TABLE match_event_observations IS
  'Events as reported by one source, hanging off that source''s observation of '
  'the match. Cross-source event merging is out of scope until Phase 2.';

-- ---------------------------------------------------------------------------
-- standings_snapshots: already observation-shaped by design, just gets the
-- raw-payload link for consistency.
-- ---------------------------------------------------------------------------

ALTER TABLE standings_snapshots
  ADD COLUMN raw_payload_id bigint REFERENCES raw_payloads (id);

-- migrate:down

ALTER TABLE standings_snapshots DROP COLUMN raw_payload_id;

ALTER TABLE match_event_observations DROP COLUMN raw_payload_id;
ALTER INDEX match_event_observations_obs_idx RENAME TO match_events_match_idx;
ALTER TABLE match_event_observations RENAME COLUMN observation_id TO match_id;
ALTER TABLE match_event_observations RENAME TO match_events;

DROP INDEX match_observations_match_key_idx;
ALTER TABLE match_observations DROP COLUMN match_key;
ALTER TABLE match_observations DROP COLUMN raw_payload_id;
ALTER INDEX match_observations_status_idx RENAME TO matches_status_idx;
ALTER INDEX match_observations_away_team_idx RENAME TO matches_away_team_idx;
ALTER INDEX match_observations_home_team_idx RENAME TO matches_home_team_idx;
ALTER INDEX match_observations_season_idx RENAME TO matches_season_idx;
ALTER TABLE match_observations RENAME TO matches;

ALTER TABLE sources DROP COLUMN license;
DROP TYPE source_license;
