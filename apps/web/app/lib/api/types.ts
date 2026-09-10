/**
 * The wire contract of `apps/api`, as the web app consumes it.
 *
 * These types are the web app's *expectation*, not a generated client: the API
 * does not exist yet (issue #18). They are written here first deliberately —
 * ADR 0006 makes the web app the API's continuous integration test, so the
 * shapes a page actually needs are the honest starting point for the endpoints.
 * When #18 lands, the API adopts this contract or this file changes with it;
 * either way the disagreement is visible in a diff rather than at runtime.
 *
 * Field names are `snake_case` to match the columns in docs/data-dictionary.md.
 * A response should be readable next to the dictionary without a translation
 * table, and the API is public — third parties read the dictionary, not our
 * TypeScript.
 */

/** `confidence_level` in the schema. `disputed` means sources contradict each other. */
export type Confidence = "high" | "medium" | "low" | "disputed";

/** `match_status` in the schema. */
export type MatchStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled"
  | "unknown";

/** `division` in the schema. `unknown` means the source did not say — never assume. */
export type Division = "primera" | "segunda" | "other" | "unknown";

/**
 * Where a fact came from and how much we trust it. Present on every row the API
 * serves — non-negotiable #6 in AGENTS.md, and the reason the UI can show a
 * source badge on every number rather than presenting claims as truth.
 */
export interface Provenance {
  /** `sources.key`, e.g. `ligafutve`, `wikipedia`, `apifootball`. */
  source: string;
  /** When the payload this row was parsed from was retrieved. Not when we wrote it. */
  fetched_at: string;
  confidence: Confidence;
}

/**
 * Phase 1 serves observations, not resolved facts (ADR 0008), so every response
 * states the single source it is scoped to. Cross-source reads are a Phase 2
 * problem and are deliberately not expressible here.
 */
export interface ResponseMeta {
  source: string;
  generated_at: string;
}

/**
 * Cursor pagination, decided now rather than retrofitted (issue #18).
 *
 * Opaque cursor rather than offset: standings and matches are append-heavy and
 * a poller can insert rows between two page reads, which silently duplicates or
 * skips rows under `OFFSET`.
 */
export interface PageInfo {
  limit: number;
  /** `null` on the last page. Pass it back as `cursor` for the next one. */
  next_cursor: string | null;
}

export interface Paginated<T> {
  data: T[];
  page: PageInfo;
  meta: ResponseMeta;
}

/** A single resource, with the same envelope minus pagination. */
export interface Single<T> {
  data: T;
  meta: ResponseMeta;
}

/** A club as referenced from a match or a standings row. */
export interface TeamRef {
  id: string;
  canonical_name: string;
  short_name: string | null;
}

export interface Team extends TeamRef {
  city: string | null;
  founded_year: number | null;
  /** The source's own identifier for this club. */
  source_ref: string;
  provenance: Provenance;
}

/**
 * One row per (source, fixture) — `match_observations`. Two sources covering
 * the same real fixture produce two of these, on purpose.
 */
export interface MatchObservation {
  id: string;
  /** Canonical label: `2025`, `2025-C`, `1986-87`. See the data dictionary. */
  season: string;
  stage: string | null;
  matchday: number | null;
  /** Local calendar date at the venue, `YYYY-MM-DD`. */
  match_date: string;
  kickoff_at: string | null;
  home_team: TeamRef;
  away_team: TeamRef;
  /** Full-time score excluding penalty shootouts. `null` until played. */
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  venue: string | null;
  provenance: Provenance;
}

export interface StandingsRow {
  position: number;
  team: TeamRef;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  /** As published, including any deduction already applied by the source. */
  points: number;
  /** Administrative deduction or award, when the source states one. */
  points_adjustment: number | null;
}

/**
 * A standings snapshot: the table as one source published it at one moment.
 * Not a computed view — the published table and the one our matches imply can
 * disagree, and that disagreement is worth seeing.
 */
export interface StandingsSnapshot {
  season: string;
  stage: string | null;
  observed_at: string;
  rows: StandingsRow[];
  provenance: Provenance;
}

export interface TeamsQuery {
  season?: string;
  division?: Division;
  limit?: number;
  cursor?: string;
  source?: string;
}

export interface MatchesQuery {
  season?: string;
  /** Team id; matches where the club played either side. */
  team?: string;
  /** Inclusive `match_date` bounds, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  status?: MatchStatus;
  limit?: number;
  cursor?: string;
  source?: string;
}

export interface StandingsQuery {
  season: string;
  stage?: string;
  /** Latest snapshot at or before this instant. Omit for the most recent. */
  as_of?: string;
  source?: string;
}
