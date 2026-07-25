import type pg from "pg";
import type { Poller, PollerContext, PollerResult } from "../../framework/context.ts";
import { parseEvents, parseStandings, type ParsedMatch, type ParsedStanding } from "./parse.ts";

const BASE = "https://apiv3.apifootball.com";
const SOURCE = "apifootball";
const CONFIDENCE = "medium"; // third-party feed, "as is" per their ToS

function requireKey(): string {
  const key = process.env["APIFOOTBALL_API_KEY"];
  if (!key) {
    throw new Error(
      "APIFOOTBALL_API_KEY is not set. Their terms make accounts individual — get your own key " +
        "at apifootball.com rather than reusing someone else's (see #52).",
    );
  }
  return key;
}

function leagueId(): string {
  return process.env["APIFOOTBALL_LEAGUE_ID"] ?? "337";
}

/**
 * Find or create the canonical team row.
 *
 * `teams` has a global unique index on lower(canonical_name), so it behaves as
 * a shared dimension rather than a per-source observation — two sources naming
 * the same club must land on one row. We therefore key on the canonical name
 * from the alias table and reuse whatever row exists.
 *
 * Consequence worth knowing: only the first source to create a club gets its
 * source_ref recorded. Mapping every source's id to one club needs a proper
 * team_source_refs table, which belongs with Phase 2 entity resolution.
 */
async function upsertTeam(
  db: pg.ClientBase,
  params: { canonical: string; sourceRef: string; fetchedAt: Date; rawPayloadId: number },
): Promise<string> {
  // Bare ON CONFLICT DO NOTHING, so this survives EITHER unique constraint:
  // (source, source_ref) on a re-run, or lower(canonical_name) when another
  // source already created the club.
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO teams (canonical_name, source, source_ref, fetched_at, confidence, raw_payload_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [params.canonical, SOURCE, params.sourceRef, params.fetchedAt, CONFIDENCE, params.rawPayloadId],
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

async function writeMatch(
  db: pg.ClientBase,
  match: ParsedMatch,
  teamIds: { home: string; away: string },
  meta: { fetchedAt: Date; rawPayloadId: number },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO match_observations
       (season, stage, matchday, match_date, home_team_id, away_team_id,
        home_score, away_score, status, venue,
        source, source_ref, fetched_at, confidence, raw_payload_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (source, source_ref) DO UPDATE SET
       home_score = EXCLUDED.home_score,
       away_score = EXCLUDED.away_score,
       status     = EXCLUDED.status,
       matchday   = EXCLUDED.matchday,
       venue      = EXCLUDED.venue,
       fetched_at = EXCLUDED.fetched_at,
       raw_payload_id = EXCLUDED.raw_payload_id`,
    [
      match.season, match.stage, match.matchday, match.matchDate,
      teamIds.home, teamIds.away, match.homeScore, match.awayScore,
      match.status, match.venue,
      SOURCE, match.sourceRef, meta.fetchedAt, CONFIDENCE, meta.rawPayloadId,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

async function writeStanding(
  db: pg.ClientBase,
  standing: ParsedStanding,
  teamId: string,
  meta: { fetchedAt: Date; rawPayloadId: number },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO standings_snapshots
       (season, stage, observed_at, team_id, position, played, won, drawn, lost,
        goals_for, goals_against, points,
        source, fetched_at, confidence, raw_payload_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (source, season, stage, observed_at, team_id) DO NOTHING`,
    [
      standing.season, standing.stage, meta.fetchedAt, teamId,
      standing.position, standing.played, standing.won, standing.drawn, standing.lost,
      standing.goalsFor, standing.goalsAgainst, standing.points,
      SOURCE, meta.fetchedAt, CONFIDENCE, meta.rawPayloadId,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface ApifootballOptions {
  /** Seasons to fetch, e.g. ["2026"]. Coverage runs back to 2005. */
  years?: string[];
  /** Also fetch the current standings table. */
  standings?: boolean;
}

export function createApifootballPoller(options: ApifootballOptions = {}): Poller {
  const years = options.years ?? [String(new Date().getUTCFullYear())];
  const withStandings = options.standings ?? true;

  return {
    key: "apifootball",
    source: SOURCE,
    describe: "APIfootball.com — current season and history back to 2005 (league 337)",

    async run(ctx: PollerContext): Promise<PollerResult> {
      const key = requireKey();
      const league = leagueId();
      let parsed = 0;
      let written = 0;
      let unresolved = 0;

      const teamCache = new Map<string, string>();
      const resolveTeamId = async (canonical: string, sourceRef: string | null, meta: { fetchedAt: Date; rawPayloadId: number }) => {
        const cached = teamCache.get(canonical);
        if (cached) return cached;
        const id = await upsertTeam(ctx.db, { canonical, sourceRef: sourceRef ?? canonical, ...meta });
        teamCache.set(canonical, id);
        return id;
      };

      for (const year of years) {
        const stored = await ctx.fetchAndStore(
          `events-${year}`,
          `${BASE}/?action=get_events&from=${year}-01-01&to=${year}-12-31&league_id=${league}&APIkey=${key}`,
        );
        const matches = parseEvents(stored.body, league);
        parsed += matches.length;
        ctx.logger.info({ year, matches: matches.length, deduped: stored.deduped }, "events parsed");

        for (const match of matches) {
          if (!match.homeCanonical || !match.awayCanonical) {
            // Never guess. An unresolved name is a job for the alias table (#13).
            unresolved += 1;
            ctx.logger.warn(
              { home: match.homeTeamName, away: match.awayTeamName, sourceRef: match.sourceRef },
              "unresolved team name — skipping match",
            );
            continue;
          }
          if (ctx.dryRun) continue;

          const meta = { fetchedAt: stored.fetchedAt, rawPayloadId: stored.rawPayloadId };
          const home = await resolveTeamId(match.homeCanonical, match.homeTeamRef, meta);
          const away = await resolveTeamId(match.awayCanonical, match.awayTeamRef, meta);
          if (await writeMatch(ctx.db, match, { home, away }, meta)) written += 1;
        }
      }

      if (withStandings) {
        const year = years[years.length - 1]!;
        const stored = await ctx.fetchAndStore(
          `standings-${league}`,
          `${BASE}/?action=get_standings&league_id=${league}&APIkey=${key}`,
        );
        const table = parseStandings(stored.body, league, year);
        parsed += table.length;
        ctx.logger.info({ rows: table.length, deduped: stored.deduped }, "standings parsed");

        for (const row of table) {
          if (!row.canonical) {
            unresolved += 1;
            ctx.logger.warn({ team: row.teamName }, "unresolved team name — skipping standing");
            continue;
          }
          if (ctx.dryRun) continue;

          const meta = { fetchedAt: stored.fetchedAt, rawPayloadId: stored.rawPayloadId };
          const teamId = await resolveTeamId(row.canonical, row.teamRef, meta);
          if (await writeStanding(ctx.db, row, teamId, meta)) written += 1;
        }
      }

      return { fetched: 0, deduped: 0, parsed, written, unresolved };
    },
  };
}

export const apifootballPoller = createApifootballPoller();
