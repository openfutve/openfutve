-- migrate:up

-- Every fact table carries source, fetched_at, confidence, ingested_at.
-- See docs/data-dictionary.md — no column exists without an entry there.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low', 'disputed');

CREATE TYPE match_status AS ENUM (
  'scheduled', 'live', 'finished', 'postponed', 'cancelled', 'unknown'
);

CREATE TYPE match_event_type AS ENUM (
  'goal', 'own_goal', 'penalty_goal', 'penalty_missed',
  'yellow_card', 'red_card', 'second_yellow',
  'substitution', 'other'
);

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------

CREATE TABLE sources (
  key                text PRIMARY KEY,
  name               text NOT NULL,
  base_url           text,
  license_note       text,
  default_confidence confidence_level NOT NULL DEFAULT 'medium',
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sources IS
  'Registry of data sources. Every fact row references one. See docs/data-sources.md.';

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------

CREATE TABLE teams (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  short_name     text,
  founded_year   int CHECK (founded_year BETWEEN 1800 AND 2100),
  city           text,

  source         text NOT NULL REFERENCES sources (key),
  source_ref     text,
  fetched_at     timestamptz NOT NULL,
  confidence     confidence_level NOT NULL,
  ingested_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, source_ref)
);

CREATE UNIQUE INDEX teams_canonical_name_key ON teams (lower(canonical_name));

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------

CREATE TABLE players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  birth_date  date,
  position    text,

  source      text NOT NULL REFERENCES sources (key),
  source_ref  text,
  fetched_at  timestamptz NOT NULL,
  confidence  confidence_level NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, source_ref)
);

CREATE INDEX players_full_name_idx ON players (lower(full_name));

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------

CREATE TABLE matches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season       text NOT NULL,
  stage        text,
  matchday     int,

  -- kickoff_at is unknown for most historical matches; match_date is the
  -- local calendar date at the venue and is always known.
  kickoff_at   timestamptz,
  match_date   date NOT NULL,

  home_team_id uuid NOT NULL REFERENCES teams (id),
  away_team_id uuid NOT NULL REFERENCES teams (id),

  -- Full-time score excluding penalty shootouts. See docs/data-dictionary.md.
  home_score   int CHECK (home_score >= 0),
  away_score   int CHECK (away_score >= 0),

  status       match_status NOT NULL DEFAULT 'scheduled',
  venue        text,

  source       text NOT NULL REFERENCES sources (key),
  source_ref   text,
  fetched_at   timestamptz NOT NULL,
  confidence   confidence_level NOT NULL,
  ingested_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT matches_distinct_teams CHECK (home_team_id <> away_team_id),
  CONSTRAINT matches_finished_has_score CHECK (
    status <> 'finished' OR (home_score IS NOT NULL AND away_score IS NOT NULL)
  ),
  UNIQUE (source, source_ref)
);

CREATE INDEX matches_season_idx ON matches (season, match_date);
CREATE INDEX matches_home_team_idx ON matches (home_team_id);
CREATE INDEX matches_away_team_idx ON matches (away_team_id);
CREATE INDEX matches_status_idx ON matches (status) WHERE status IN ('scheduled', 'live');

-- ---------------------------------------------------------------------------
-- match_events
-- ---------------------------------------------------------------------------

CREATE TABLE match_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  type              match_event_type NOT NULL,

  -- 45+2 is minute=45, minute_extra=2.
  minute            int CHECK (minute BETWEEN 0 AND 130),
  minute_extra      int CHECK (minute_extra >= 0),

  team_id           uuid REFERENCES teams (id),
  player_id         uuid REFERENCES players (id),
  related_player_id uuid REFERENCES players (id),

  -- Source-specific extras not yet promoted to columns. Not served by the API.
  detail            jsonb NOT NULL DEFAULT '{}'::jsonb,

  source            text NOT NULL REFERENCES sources (key),
  source_ref        text,
  fetched_at        timestamptz NOT NULL,
  confidence        confidence_level NOT NULL,
  ingested_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, source_ref)
);

CREATE INDEX match_events_match_idx ON match_events (match_id, minute, minute_extra);

-- ---------------------------------------------------------------------------
-- standings_snapshots
--
-- What a source published at a point in time, not a computed view. We compute
-- our own standings separately and reconcile. See docs/data-dictionary.md.
-- ---------------------------------------------------------------------------

CREATE TABLE standings_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season            text NOT NULL,
  stage             text,
  observed_at       timestamptz NOT NULL,

  team_id           uuid NOT NULL REFERENCES teams (id),
  position          int NOT NULL CHECK (position > 0),
  played            int NOT NULL CHECK (played >= 0),
  won               int NOT NULL CHECK (won >= 0),
  drawn             int NOT NULL CHECK (drawn >= 0),
  lost              int NOT NULL CHECK (lost >= 0),
  goals_for         int NOT NULL CHECK (goals_for >= 0),
  goals_against     int NOT NULL CHECK (goals_against >= 0),
  points            int NOT NULL,
  points_adjustment int,

  source            text NOT NULL REFERENCES sources (key),
  source_ref        text,
  fetched_at        timestamptz NOT NULL,
  confidence        confidence_level NOT NULL,
  ingested_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT standings_results_sum CHECK (won + drawn + lost = played),
  UNIQUE (source, season, stage, observed_at, team_id)
);

CREATE INDEX standings_season_observed_idx
  ON standings_snapshots (season, observed_at DESC);

-- ---------------------------------------------------------------------------
-- raw_payloads
--
-- ADR 0005: pollers store the unparsed payload before any interpretation.
-- Phase 1 lands raw here; Phase 2 moves this role to raw.{source} topics.
-- ---------------------------------------------------------------------------

CREATE TABLE raw_payloads (
  id           bigserial PRIMARY KEY,
  source       text NOT NULL REFERENCES sources (key),
  endpoint     text NOT NULL,
  request_url  text NOT NULL,
  http_status  int,
  content_type text,
  -- Verbatim bytes as received. Never republished; see LICENSE-DATA.
  body         bytea NOT NULL,
  -- sha256 of body, for dedupe: an unchanged page is not a new payload.
  body_sha256  bytea NOT NULL,
  fetched_at   timestamptz NOT NULL,
  ingested_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, endpoint, body_sha256)
);

CREATE INDEX raw_payloads_source_fetched_idx ON raw_payloads (source, fetched_at DESC);

-- migrate:down

DROP TABLE IF EXISTS raw_payloads;
DROP TABLE IF EXISTS standings_snapshots;
DROP TABLE IF EXISTS match_events;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS sources;
DROP TYPE IF EXISTS match_event_type;
DROP TYPE IF EXISTS match_status;
DROP TYPE IF EXISTS confidence_level;
