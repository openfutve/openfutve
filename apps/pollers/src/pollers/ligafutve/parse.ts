import { resolveTeamName, isReserveSide } from "@openfutve/shared";

export interface SeasonTerm {
  year: string;
  /** "A" for Apertura, "C" for Clausura, null when the term does not say. */
  tournament: "A" | "C" | null;
  /** Everything more granular than the tournament. Null when the term adds nothing. */
  stage: string | null;
  /** True when the term names Liga FUTVE 2 — out of scope. */
  isSecondDivision: boolean;
}

/**
 * SportsPress season terms are free text and inconsistent across years:
 *
 *   Temporada 2021 Fase Grupos
 *   Temporada 2022 Liga FUTVE Fase Final B Grupo 1
 *   Torneo Apertura Temporada 2024 Fase Regular
 *   Cuadrangular A - Torneo Apertura Temporada 2024
 *   Temporada 2023 Liga FUTVE 2 - 1ra Etapa Grupo Occidental
 *
 * Normalised into the data-dictionary form: `season` carries year plus
 * tournament, everything else lands in `stage`.
 */
export function parseSeasonTerm(name: string): SeasonTerm | null {
  const year = /Temporada\s+(\d{4})/i.exec(name)?.[1];
  if (!year) return null;

  const tournamentWord = /Torneo\s+(Apertura|Clausura)/i.exec(name)?.[1]?.toLowerCase();
  const tournament = tournamentWord === "apertura" ? "A" : tournamentWord === "clausura" ? "C" : null;

  // "Liga FUTVE 2" must be checked before the bare "Liga FUTVE".
  const isSecondDivision = /Liga\s+FUTVE\s*2\b/i.test(name);

  const stage =
    name
      .replace(/Temporada\s+\d{4}/i, " ")
      .replace(/Torneo\s+(Apertura|Clausura)/i, " ")
      .replace(/Liga\s+FUTVE\s*2\b/i, " ")
      .replace(/Liga\s+FUTVE\b/i, " ")
      .replace(/[-–]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || null;

  return { year, tournament, stage, isSecondDivision };
}

/** Season label per docs/data-dictionary.md: year plus tournament, nothing else. */
export function seasonLabel(term: SeasonTerm): string {
  return term.tournament ? `${term.year}-${term.tournament}` : term.year;
}

export interface ParsedMatch {
  sourceRef: string;
  season: string;
  stage: string | null;
  matchDate: string;
  kickoffAt: Date | null;
  homeName: string;
  awayName: string;
  homeCanonical: string | null;
  awayCanonical: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "finished";
  venue: string | null;
  /** Why the match was skipped, when it was. */
  skip?: "not-primera" | "second-division" | "reserve-side" | "unresolved-team" | "malformed";
}

export interface Lookups {
  teams: Map<number, string>;
  seasons: Map<number, string>;
  venues: Map<number, string>;
}

function score(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * SportsPress puts the home side first in `teams` and `main_results`.
 * Verified against the event titles, which read "Home vs. Away".
 */
export function parseEvents(body: Buffer, lookups: Lookups, primeraLeagueId: number): ParsedMatch[] {
  const payload: unknown = JSON.parse(body.toString("utf8"));
  if (!Array.isArray(payload)) return [];

  const out: ParsedMatch[] = [];
  for (const raw of payload as Record<string, any>[]) {
    const id = raw["id"];
    const teams: unknown = raw["teams"];
    if (typeof id !== "number" || !Array.isArray(teams) || teams.length < 2) continue;

    const homeName = lookups.teams.get(Number(teams[0]));
    const awayName = lookups.teams.get(Number(teams[1]));
    const base = {
      sourceRef: String(id),
      matchDate: String(raw["date"] ?? "").slice(0, 10),
      kickoffAt: raw["date_gmt"] ? new Date(`${raw["date_gmt"]}Z`) : null,
      homeName: homeName ?? `#${teams[0]}`,
      awayName: awayName ?? `#${teams[1]}`,
      venue: lookups.venues.get(Number((raw["venues"] as number[])?.[0])) ?? null,
    };

    // Scope guard 1: the league term must be Liga FUTVE, not Liga FUTVE 2.
    const leagues: number[] = Array.isArray(raw["leagues"]) ? raw["leagues"] : [];
    if (!leagues.includes(primeraLeagueId)) {
      out.push({ ...base, season: "", stage: null, homeCanonical: null, awayCanonical: null,
        homeScore: null, awayScore: null, status: "scheduled", skip: "not-primera" });
      continue;
    }

    const seasonName = lookups.seasons.get(Number((raw["seasons"] as number[])?.[0]));
    const term = seasonName ? parseSeasonTerm(seasonName) : null;
    if (!term) {
      out.push({ ...base, season: "", stage: null, homeCanonical: null, awayCanonical: null,
        homeScore: null, awayScore: null, status: "scheduled", skip: "malformed" });
      continue;
    }
    // Scope guard 2: some second-division fixtures carry the Primera league term
    // but a Liga FUTVE 2 season term. Belt and braces.
    if (term.isSecondDivision) {
      out.push({ ...base, season: seasonLabel(term), stage: term.stage, homeCanonical: null, awayCanonical: null,
        homeScore: null, awayScore: null, status: "scheduled", skip: "second-division" });
      continue;
    }

    // Scope guard 3: reserve sides are not the top flight.
    if (isReserveSide(base.homeName) || isReserveSide(base.awayName)) {
      out.push({ ...base, season: seasonLabel(term), stage: term.stage, homeCanonical: null, awayCanonical: null,
        homeScore: null, awayScore: null, status: "scheduled", skip: "reserve-side" });
      continue;
    }

    const results: unknown[] = Array.isArray(raw["main_results"]) ? raw["main_results"] : [];
    const homeScore = score(results[0]);
    const awayScore = score(results[1]);
    const homeCanonical = resolveTeamName(base.homeName) ?? null;
    const awayCanonical = resolveTeamName(base.awayName) ?? null;

    out.push({
      ...base,
      season: seasonLabel(term),
      stage: term.stage,
      homeCanonical,
      awayCanonical,
      homeScore,
      awayScore,
      // The archive carries played fixtures; a missing score means not yet played.
      status: homeScore !== null && awayScore !== null ? "finished" : "scheduled",
      ...(homeCanonical && awayCanonical ? {} : { skip: "unresolved-team" as const }),
    });
  }
  return out;
}

/** WordPress term lists: `[{id, name}]` for seasons/venues, `[{id, title:{rendered}}]` for teams. */
export function toTermMap(body: Buffer, key: "name" | "title"): Map<number, string> {
  const payload: unknown = JSON.parse(body.toString("utf8"));
  const map = new Map<number, string>();
  if (!Array.isArray(payload)) return map;
  for (const term of payload as Record<string, any>[]) {
    const id = Number(term["id"]);
    const value = key === "name" ? term["name"] : term["title"]?.rendered;
    if (Number.isFinite(id) && typeof value === "string" && value.trim()) map.set(id, value.trim());
  }
  return map;
}
