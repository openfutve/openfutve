import type { Poller, PollerContext, PollerResult } from "../../framework/context.ts";
import { createTeamResolver, writeMatchObservation, type WriteMeta } from "../../framework/writers.ts";
import { parseEvents, toTermMap, type Lookups } from "./parse.ts";

const BASE = "https://ligafutve.org/wp-json/sportspress/v2";
const SOURCE = "ligafutve";
const CONFIDENCE = "high" as const; // official league source
const PRIMERA_LEAGUE_ID = 20; // 234 is Liga FUTVE 2

/**
 * Request only the fields we use. `_fields` cuts an events page from 65KB to
 * 6.4KB — the excluded bulk is Yoast SEO metadata, not football — which is both
 * politer to their server and a 10x smaller archive. Player lineups and
 * performance ARE kept, so Phase 3/4 can replay them without re-fetching, which
 * is the promise ADR 0005 makes.
 */
const EVENT_FIELDS =
  "id,date,date_gmt,title,teams,leagues,seasons,venues,main_results,results,outcome,winner,status,players,performance";

const PER_PAGE = 100;

export interface LigafutveOptions {
  /** Stop after this many pages. Useful for a smoke run. */
  maxPages?: number;
}

export function createLigafutvePoller(options: LigafutveOptions = {}): Poller {
  const maxPages = options.maxPages ?? 100;

  return {
    key: "ligafutve",
    source: SOURCE,
    describe: "ligafutve.org SportsPress API — official archive, 2021 to mid-2025 (league 20)",

    async run(ctx: PollerContext): Promise<PollerResult> {
      // Term lists first: events reference teams, seasons and venues by id.
      const [teamsPayload, seasonsPayload, venuesPayload] = [
        await ctx.fetchAndStore("teams", `${BASE}/teams?per_page=100&_fields=id,title,leagues`),
        await ctx.fetchAndStore("seasons", `${BASE}/seasons?per_page=100&_fields=id,name`),
        await ctx.fetchAndStore("venues", `${BASE}/venues?per_page=100&_fields=id,name`),
      ];

      const lookups: Lookups = {
        teams: toTermMap(teamsPayload.body, "title"),
        seasons: toTermMap(seasonsPayload.body, "name"),
        venues: toTermMap(venuesPayload.body, "name"),
      };
      ctx.logger.info(
        { teams: lookups.teams.size, seasons: lookups.seasons.size, venues: lookups.venues.size },
        "lookups loaded",
      );

      const resolveTeamId = createTeamResolver(ctx.db);
      let parsed = 0;
      let written = 0;
      let unresolved = 0;
      const skipped: Record<string, number> = {};

      for (let page = 1; page <= maxPages; page += 1) {
        const stored = await ctx.fetchAndStore(
          `events-p${page}`,
          `${BASE}/events?per_page=${PER_PAGE}&page=${page}&orderby=date&order=asc&_fields=${EVENT_FIELDS}`,
        );

        const matches = parseEvents(stored.body, lookups, PRIMERA_LEAGUE_ID);
        parsed += matches.length;

        const meta: WriteMeta = {
          source: SOURCE,
          confidence: CONFIDENCE,
          fetchedAt: stored.fetchedAt,
          rawPayloadId: stored.rawPayloadId,
        };

        for (const match of matches) {
          if (match.skip) {
            skipped[match.skip] = (skipped[match.skip] ?? 0) + 1;
            if (match.skip === "unresolved-team") {
              unresolved += 1;
              ctx.logger.warn({ home: match.homeName, away: match.awayName, sourceRef: match.sourceRef },
                "unresolved team name — skipping match");
            }
            continue;
          }
          if (ctx.dryRun) continue;

          const home = await resolveTeamId(match.homeCanonical!, null, meta);
          const away = await resolveTeamId(match.awayCanonical!, null, meta);
          const ok = await writeMatchObservation(
            ctx.db,
            {
              sourceRef: match.sourceRef,
              season: match.season,
              stage: match.stage,
              matchday: null, // SportsPress has no matchday concept here
              matchDate: match.matchDate,
              kickoffAt: match.kickoffAt,
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

        ctx.logger.info({ page, onPage: matches.length, written, deduped: stored.deduped }, "events page");
        // WordPress errors on a page past the end, so stop on a short page.
        if (matches.length < PER_PAGE) break;
      }

      ctx.logger.info({ skipped }, "skipped by reason");
      return { fetched: 0, deduped: 0, parsed, written, unresolved };
    },
  };
}

export const ligafutvePoller = createLigafutvePoller();
