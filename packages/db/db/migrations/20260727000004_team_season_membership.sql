-- migrate:up
--
-- ADR 0009: division membership is a fact about a club AND a season.
--
-- Clubs are promoted and relegated, so "is this club in the Primera?" has no
-- answer without a season attached. Aragua FC is Primera in 2021-2023 and
-- Segunda in 2026, and both are correct. Nothing in the schema could express
-- that, so scope filtering rested on static lists that were already drifting.

CREATE TYPE division AS ENUM (
  'primera',   -- Liga FUTVE Primera División — the project's scope
  'segunda',   -- Liga FUTVE 2
  'other',     -- cup, reserve or youth competition
  'unknown'    -- the source did not say; do not assume
);

CREATE TABLE team_season_observations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,

  -- Season label per docs/data-dictionary.md: '2021', '2024-A'. Membership is
  -- per tournament where a split exists, since a club can be admitted or
  -- excluded between Apertura and Clausura.
  season      text NOT NULL,
  division    division NOT NULL,

  source         text NOT NULL REFERENCES sources (key),
  -- The source's own handle on this membership: a season term id, a league id.
  source_ref     text,
  fetched_at     timestamptz NOT NULL,
  confidence     confidence_level NOT NULL,
  raw_payload_id bigint REFERENCES raw_payloads (id),
  ingested_at    timestamptz NOT NULL DEFAULT now(),

  -- One claim per source per club-season. Sources may disagree with each
  -- other — that is the point of an observation table (ADR 0008) — but a
  -- single source contradicting itself is a bug worth failing on.
  UNIQUE (source, team_id, season)
);

COMMENT ON TABLE team_season_observations IS
  'Which division a club played in for a given season, as claimed by one '
  'source. NOT deduplicated across sources. Scope filtering joins against '
  'this rather than guessing from a static club list (ADR 0009).';

CREATE INDEX team_season_observations_season_idx
  ON team_season_observations (season, division);

CREATE INDEX team_season_observations_team_idx
  ON team_season_observations (team_id);

-- migrate:down

DROP TABLE IF EXISTS team_season_observations;
DROP TYPE IF EXISTS division;
