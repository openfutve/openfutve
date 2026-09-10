import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type {
  MatchObservation,
  Provenance,
  StandingsRow,
  StandingsSnapshot,
  Team,
  TeamRef,
} from "../app/lib/api/types.ts";

/**
 * The mock API's data, derived from the committed source samples in
 * `docs/samples/ligafutve/`.
 *
 * Nothing here is invented. AGENTS.md is explicit that we do not make data up,
 * and a mock full of "Team A 2–1 Team B" would have hidden every real problem
 * this skeleton needed to surface — 14-club tables, accented names, a club
 * whose short name is longer than its city, a season label that is not a year.
 * Reshaping the real samples into the wire contract also proves the contract
 * can actually carry what the sources produce.
 *
 * Scope: league term 20 is Liga FUTVE (Primera); 234 is Liga FUTVE 2 and is
 * excluded, per the scope guard in AGENTS.md.
 */

const PRIMERA_LEAGUE_ID = 20;
const SOURCE = "ligafutve";

const samplePath = (name: string) =>
  fileURLToPath(new URL(`../../../docs/samples/ligafutve/${name}`, import.meta.url));

function sample<T>(name: string): T {
  return JSON.parse(readFileSync(samplePath(name), "utf8")) as T;
}

/**
 * When these bytes were captured. The samples are committed files, so their
 * mtime is the closest honest answer — inventing a `fetched_at` would put a
 * false provenance timestamp on every row the UI renders.
 */
function fetchedAt(name: string): string {
  return statSync(samplePath(name)).mtime.toISOString();
}

const provenance = (name: string): Provenance => ({
  source: SOURCE,
  fetched_at: fetchedAt(name),
  // `sources.default_confidence` for ligafutve, per packages/db/db/seeds.
  confidence: "high",
});

interface SportsPressTable {
  id: number;
  title: { rendered: string };
  modified_gmt: string;
  leagues: number[];
  data: Record<string, Record<string, string | number>>;
}

interface SportsPressEvent {
  id: number;
  date: string;
  date_gmt: string;
  leagues: number[];
  seasons: number[];
  venues: number[];
  teams: number[];
  main_results: string[];
}

interface SportsPressTerm {
  id: number;
  name: string;
}

const int = (value: unknown): number => Number.parseInt(String(value ?? ""), 10) || 0;

/**
 * The same normalisation the ligafutve poller applies, kept deliberately small:
 * the mock only needs the season terms that appear in the samples. The poller's
 * `parseSeasonTerm` is the real implementation and the one under test.
 */
function seasonLabel(term: string): { season: string; stage: string | null } {
  const year = /Temporada\s+(\d{4})/i.exec(term)?.[1] ?? "";
  const tournament = /Torneo\s+(Apertura|Clausura)/i.exec(term)?.[1]?.toLowerCase();
  const suffix = tournament === "apertura" ? "-A" : tournament === "clausura" ? "-C" : "";
  const stage =
    term
      .replace(/Temporada\s+\d{4}/i, " ")
      .replace(/Torneo\s+(Apertura|Clausura)/i, " ")
      .replace(/Liga\s+FUTVE\s*2?\b/i, " ")
      .replace(/[-–]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || null;
  return { season: `${year}${suffix}`, stage };
}

/** Source ids are integers; the real API serves uuids. The shape is what matters. */
const teamId = (sourceRef: number | string) => `${SOURCE}-${sourceRef}`;

const primeraTable = sample<SportsPressTable[]>("tables.json").find((table) =>
  table.leagues.includes(PRIMERA_LEAGUE_ID),
)!;

/**
 * The accumulated 2025 table doubles as the club roster: a standings snapshot is
 * a per-season roster by construction (ADR 0009). Row key `0` is SportsPress's
 * header row, not a club.
 */
const tableRows = Object.entries(primeraTable.data).filter(([key]) => key !== "0");

const TABLE_SEASON = /Temporada\s+(\d{4})/i.exec(primeraTable.title.rendered)?.[1] ?? "2025";

export const teams: Team[] = tableRows
  .map(([sourceRef, row]) => ({
    id: teamId(sourceRef),
    canonical_name: String(row["name"]),
    // The samples carry no short name, city or founding year for Primera clubs.
    // `null` means "we don't know" — it never means empty.
    short_name: null,
    city: null,
    founded_year: null,
    source_ref: sourceRef,
    provenance: provenance("tables.json"),
  }))
  .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name, "es"));

const teamsById = new Map(teams.map((team) => [team.id, team]));

const teamRef = (sourceRef: number | string): TeamRef => {
  const team = teamsById.get(teamId(sourceRef));
  return team
    ? { id: team.id, canonical_name: team.canonical_name, short_name: team.short_name }
    : { id: teamId(sourceRef), canonical_name: `#${sourceRef}`, short_name: null };
};

export const standings: StandingsSnapshot = {
  season: TABLE_SEASON,
  stage: "Tabla Acumulada",
  observed_at: new Date(`${primeraTable.modified_gmt}Z`).toISOString(),
  provenance: provenance("tables.json"),
  rows: tableRows
    .map<StandingsRow>(([sourceRef, row]) => ({
      position: int(row["pos"]),
      team: teamRef(sourceRef),
      played: int(row["p"]),
      won: int(row["w"]),
      drawn: int(row["d"]),
      lost: int(row["l"]),
      goals_for: int(row["f"]),
      goals_against: int(row["a"]),
      goal_difference: int(row["gd"]),
      points: int(row["pts"]),
      // The source publishes no deduction column; unknown, not zero.
      points_adjustment: null,
    }))
    .sort((a, b) => a.position - b.position),
};

const seasonTerms = new Map(
  sample<SportsPressTerm[]>("seasons-all.json").map((term) => [term.id, term.name]),
);
const venueTerms = new Map(
  sample<SportsPressTerm[]>("venues-all.json").map((term) => [term.id, term.name]),
);

export const matches: MatchObservation[] = sample<SportsPressEvent[]>("events-trimmed.json")
  .filter((event) => event.leagues.includes(PRIMERA_LEAGUE_ID))
  .map<MatchObservation>((event) => {
    const term = seasonTerms.get(event.seasons[0]!) ?? "";
    const { season, stage } = seasonLabel(term);
    const homeScore = event.main_results[0] === undefined ? null : int(event.main_results[0]);
    const awayScore = event.main_results[1] === undefined ? null : int(event.main_results[1]);

    return {
      id: `${SOURCE}-${event.id}`,
      season,
      stage,
      // SportsPress publishes no matchday number.
      matchday: null,
      match_date: event.date.slice(0, 10),
      kickoff_at: new Date(`${event.date_gmt}Z`).toISOString(),
      // SportsPress puts the home side first in `teams` and `main_results`.
      home_team: teamRef(event.teams[0]!),
      away_team: teamRef(event.teams[1]!),
      home_score: homeScore,
      away_score: awayScore,
      status: homeScore !== null && awayScore !== null ? "finished" : "scheduled",
      venue: venueTerms.get(event.venues[0]!) ?? null,
      provenance: provenance("events-trimmed.json"),
    };
  })
  // Newest first: the list pages read as "what just happened".
  .sort((a, b) => b.match_date.localeCompare(a.match_date));

export const SOURCE_KEY = SOURCE;
