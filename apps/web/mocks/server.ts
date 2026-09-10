import { createServer } from "node:http";

import { SOURCE_KEY, matches, standings, teams } from "./fixtures.ts";
import type { MatchObservation, Team } from "../app/lib/api/types.ts";

/**
 * A stand-in for `apps/api` while issue #18 is open.
 *
 * It exists so the web app can be developed, reviewed and screenshotted against
 * the contract in `app/lib/api/types.ts` — and so that contract is exercised by
 * something rather than only asserted. It serves the committed source samples
 * (see `fixtures.ts`); it never touches the network and it is not a substitute
 * for the real API. Delete this directory when #18 lands.
 *
 *   pnpm --filter @openfutve/web mock:api
 */

/** `API_PORT` from `.env.example` — the mock stands in for the real API. */
const PORT = Number(process.env.MOCK_API_PORT ?? 3000);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Cursors are opaque to clients; here they encode an offset. */
const encodeCursor = (offset: number) => Buffer.from(String(offset), "utf8").toString("base64url");
const decodeCursor = (cursor: string | null): number => {
  if (!cursor) return 0;
  const offset = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
};

function meta() {
  return { source: SOURCE_KEY, generated_at: new Date().toISOString() };
}

function paginate<T>(rows: T[], params: URLSearchParams) {
  const requested = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = decodeCursor(params.get("cursor"));
  const page = rows.slice(offset, offset + limit);
  const nextOffset = offset + limit;

  return {
    data: page,
    page: { limit, next_cursor: nextOffset < rows.length ? encodeCursor(nextOffset) : null },
    meta: meta(),
  };
}

function filterTeams(params: URLSearchParams): Team[] {
  const division = params.get("division");
  // Every club in the sample roster is Primera by construction, so any other
  // division legitimately has none.
  if (division && division !== "primera") return [];

  const season = params.get("season");
  return season && season.slice(0, 4) !== standings.season.slice(0, 4) ? [] : teams;
}

function filterMatches(params: URLSearchParams): MatchObservation[] {
  const season = params.get("season");
  const status = params.get("status");
  const from = params.get("from");
  const to = params.get("to");
  const team = params.get("team");

  return matches.filter((match) => {
    if (season && match.season !== season) return false;
    if (status && match.status !== status) return false;
    if (from && match.match_date < from) return false;
    if (to && match.match_date > to) return false;
    if (team && match.home_team.id !== team && match.away_team.id !== team) return false;
    return true;
  });
}

const json = (body: unknown, status = 200) => ({ status, body: JSON.stringify(body, null, 2) });

function route(url: URL) {
  const params = url.searchParams;

  switch (url.pathname) {
    case "/teams":
      return json(paginate(filterTeams(params), params));

    case "/matches":
      return json(paginate(filterMatches(params), params));

    case "/standings": {
      const season = params.get("season");
      // A season we have not ingested is a 404, not an empty table — the web app
      // tells those apart and says something different for each.
      if (season && season !== standings.season) {
        return json({ error: `no standings for season ${season}` }, 404);
      }
      return json({ data: standings, meta: meta() });
    }

    case "/health":
      return json({ ok: true, source: SOURCE_KEY, teams: teams.length, matches: matches.length });

    default:
      return json({ error: `no such endpoint: ${url.pathname}` }, 404);
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  const { status, body } = route(url);

  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(body);
  console.log(`${status} ${request.method} ${url.pathname}${url.search}`);
});

server.listen(PORT, () => {
  console.log(
    `mock api on http://localhost:${PORT} — ${teams.length} clubes, ${matches.length} partidos, ` +
      `tabla ${standings.season} (${SOURCE_KEY} samples)`,
  );
});
