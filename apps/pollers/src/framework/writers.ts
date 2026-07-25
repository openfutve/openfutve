import type pg from "pg";

/** Provenance every written row carries, per ADR 0008. */
export interface WriteMeta {
  source: string;
  confidence: "high" | "medium" | "low" | "disputed";
  fetchedAt: Date;
  rawPayloadId: number;
}

export interface MatchObservation {
  sourceRef: string;
  season: string;
  stage: string | null;
  matchday: number | null;
  matchDate: string;
  kickoffAt: Date | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  venue: string | null;
}

/**
 * Find or create the canonical team row.
 *
 * `teams` carries a global unique index on lower(canonical_name), so it behaves
 * as a shared dimension rather than a per-source observation: two sources
 * naming the same club must land on one row. We key on the canonical name the
 * alias table produced and reuse whatever exists.
 *
 * Consequence: only the first source to create a club records its source_ref.
 * Mapping every source's id to one club needs a team_source_refs table, which
 * belongs with Phase 2 entity resolution.
 */
export async function upsertTeam(
  db: pg.ClientBase,
  params: { canonical: string; sourceRef: string | null } & WriteMeta,
): Promise<string> {
  // Bare ON CONFLICT DO NOTHING so this survives EITHER unique constraint:
  // (source, source_ref) on a re-run, or lower(canonical_name) when another
  // source already created the club.
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO teams (canonical_name, source, source_ref, fetched_at, confidence, raw_payload_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      params.canonical,
      params.source,
      params.sourceRef ?? params.canonical,
      params.fetchedAt,
      params.confidence,
      params.rawPayloadId,
    ],
  );
  if (inserted.rows[0]) return inserted.rows[0].id;

  const existing = await db.query<{ id: string }>(
    `SELECT id FROM teams WHERE lower(canonical_name) = lower($1)`,
    [params.canonical],
  );
  const row = existing.rows[0];
  if (!row) throw new Error(`could not resolve a teams row for '${params.canonical}'`);
  return row.id;
}

/** Idempotent upsert keyed on (source, source_ref) — a re-run refreshes, never duplicates. */
export async function writeMatchObservation(
  db: pg.ClientBase,
  match: MatchObservation,
  meta: WriteMeta,
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO match_observations
       (season, stage, matchday, match_date, kickoff_at, home_team_id, away_team_id,
        home_score, away_score, status, venue,
        source, source_ref, fetched_at, confidence, raw_payload_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (source, source_ref) DO UPDATE SET
       home_score     = EXCLUDED.home_score,
       away_score     = EXCLUDED.away_score,
       status         = EXCLUDED.status,
       matchday       = EXCLUDED.matchday,
       kickoff_at     = EXCLUDED.kickoff_at,
       venue          = EXCLUDED.venue,
       season         = EXCLUDED.season,
       stage          = EXCLUDED.stage,
       fetched_at     = EXCLUDED.fetched_at,
       raw_payload_id = EXCLUDED.raw_payload_id`,
    [
      match.season, match.stage, match.matchday, match.matchDate, match.kickoffAt,
      match.homeTeamId, match.awayTeamId, match.homeScore, match.awayScore,
      match.status, match.venue,
      meta.source, match.sourceRef, meta.fetchedAt, meta.confidence, meta.rawPayloadId,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Caches canonical name -> teams.id for the duration of a run. */
export function createTeamResolver(db: pg.ClientBase) {
  const cache = new Map<string, string>();
  return async function resolveTeamId(
    canonical: string,
    sourceRef: string | null,
    meta: WriteMeta,
  ): Promise<string> {
    const cached = cache.get(canonical);
    if (cached) return cached;
    const id = await upsertTeam(db, { canonical, sourceRef, ...meta });
    cache.set(canonical, id);
    return id;
  };
}
