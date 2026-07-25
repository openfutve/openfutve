import type pg from "pg";
import type { Poller, PollerContext, PollerResult } from "../../framework/context.ts";
import { createTeamResolver, writeMatchObservation, type WriteMeta } from "../../framework/writers.ts";
import { parseEvents, parseStandings, type ParsedStanding } from "./parse.ts";

const BASE = "https://apiv3.apifootball.com";
const SOURCE = "apifootball";
const CONFIDENCE = "medium" as const; // third-party feed, "as is" per their ToS

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

async function writeStanding(
  db: pg.ClientBase,
  standing: ParsedStanding,
  teamId: string,
  meta: WriteMeta,
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
      meta.source, meta.fetchedAt, meta.confidence, meta.rawPayloadId,
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

      const resolveTeamId = createTeamResolver(ctx.db);
      const metaFor = (stored: { fetchedAt: Date; rawPayloadId: number }): WriteMeta => ({
        source: SOURCE,
        confidence: CONFIDENCE,
        fetchedAt: stored.fetchedAt,
        rawPayloadId: stored.rawPayloadId,
      });

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
            // Never guess. An unresolved name is a job for the alias table (#13),
            // and it is what keeps mislabelled Segunda fixtures out — see
            // docs/data-sources.md.
            unresolved += 1;
            ctx.logger.warn(
              { home: match.homeTeamName, away: match.awayTeamName, sourceRef: match.sourceRef },
              "unresolved team name — skipping match",
            );
            continue;
          }
          if (ctx.dryRun) continue;

          const meta = metaFor(stored);
          const home = await resolveTeamId(match.homeCanonical, match.homeTeamRef, meta);
          const away = await resolveTeamId(match.awayCanonical, match.awayTeamRef, meta);
          const ok = await writeMatchObservation(
            ctx.db,
            {
              sourceRef: match.sourceRef,
              season: match.season,
              stage: match.stage,
              matchday: match.matchday,
              matchDate: match.matchDate,
              kickoffAt: null, // the feed gives a time with no timezone; see docs/data-sources.md
              homeTeamId: home,
              awayTeamId: away,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
              status: match.status,
              venue: match.venue,
            },
            meta,
          );
          if (ok) written += 1;
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

          const meta = metaFor(stored);
          const teamId = await resolveTeamId(row.canonical, row.teamRef, meta);
          if (await writeStanding(ctx.db, row, teamId, meta)) written += 1;
        }
      }

      return { fetched: 0, deduped: 0, parsed, written, unresolved };
    },
  };
}

export const apifootballPoller = createApifootballPoller();
