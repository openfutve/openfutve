import { resolveTeamName } from "@openfutve/shared";

/** APIfootball uses "" for absent values throughout, not null. */
function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function int(value: unknown): number | null {
  const s = str(value);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "unknown";

export interface ParsedMatch {
  sourceRef: string;
  season: string;
  stage: string | null;
  matchday: number | null;
  matchDate: string;
  homeTeamName: string;
  awayTeamName: string;
  /** The source's own team ids, so provenance points at their record, not ours. */
  homeTeamRef: string | null;
  awayTeamRef: string | null;
  /** Canonical names, or null when the alias table could not resolve them. */
  homeCanonical: string | null;
  awayCanonical: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  venue: string | null;
}

export interface ParsedStanding {
  season: string;
  stage: string | null;
  teamName: string;
  teamRef: string | null;
  canonical: string | null;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/**
 * `match_status` is "Finished", "" for not-yet-played, or a status word.
 * `match_live` is "1" while a match is in progress.
 */
export function toMatchStatus(rawStatus: unknown, rawLive: unknown): MatchStatus {
  if (str(rawLive) === "1") return "live";
  const status = str(rawStatus)?.toLowerCase();
  if (status === null || status === undefined) return "scheduled";
  if (status === "finished") return "finished";
  if (status.startsWith("postponed")) return "postponed";
  if (status.startsWith("cancel")) return "cancelled";
  if (/^\d+$/.test(status)) return "live"; // an elapsed-minute value
  return "unknown";
}

/**
 * Full-time score, deliberately EXCLUDING any penalty shootout — the rule in
 * docs/data-dictionary.md. APIfootball helpfully separates them:
 * match_hometeam_ft_score is the result before penalties, while
 * match_hometeam_score can carry the shootout-decided figure. Preferring
 * ft_score is what stops a 1-1 draw becoming a 2-1 "win" in the aggregates.
 */
export function fullTimeScore(event: Record<string, unknown>, side: "hometeam" | "awayteam"): number | null {
  return int(event[`match_${side}_ft_score`]) ?? int(event[`match_${side}_score`]);
}

/**
 * Season label per docs/data-dictionary.md: year plus tournament.
 *
 * APIfootball's **events** do not carry the tournament — their `stage_name` is
 * the useless "Current" — so events land as a bare year and the Apertura /
 * Clausura split has to come from elsewhere. Its **standings** do carry it
 * ("Apertura", "Apertura - Quadrangular"), so standings get the full label.
 *
 * Inventing the tournament from the calendar date was the obvious shortcut and
 * is exactly the kind of quiet guess ADR 0008 exists to avoid.
 */
export function seasonLabel(year: string, stageName: string | null): string {
  const stage = stageName?.toLowerCase() ?? "";
  if (stage.startsWith("apertura")) return `${year}-A`;
  if (stage.startsWith("clausura")) return `${year}-C`;
  return year;
}

export function parseEvents(body: Buffer, leagueId: string): ParsedMatch[] {
  const payload: unknown = JSON.parse(body.toString("utf8"));
  if (!Array.isArray(payload)) return [];

  const matches: ParsedMatch[] = [];
  for (const raw of payload as Record<string, unknown>[]) {
    // Scope guard: 336 is Segunda, 8092 Copa Venezuela, 8153 Supercopa.
    if (str(raw["league_id"]) !== leagueId) continue;

    const sourceRef = str(raw["match_id"]);
    const matchDate = str(raw["match_date"]);
    const home = str(raw["match_hometeam_name"]);
    const away = str(raw["match_awayteam_name"]);
    const year = str(raw["league_year"]);
    if (!sourceRef || !matchDate || !home || !away || !year) continue;

    const stageName = str(raw["stage_name"]);
    matches.push({
      sourceRef,
      season: seasonLabel(year, stageName),
      // "Current" carries no information; do not launder it into a stage.
      stage: stageName && stageName.toLowerCase() !== "current" ? stageName : null,
      matchday: int(raw["match_round"]),
      matchDate,
      homeTeamName: home,
      awayTeamName: away,
      homeTeamRef: str(raw["match_hometeam_id"]),
      awayTeamRef: str(raw["match_awayteam_id"]),
      homeCanonical: resolveTeamName(home) ?? null,
      awayCanonical: resolveTeamName(away) ?? null,
      homeScore: fullTimeScore(raw, "hometeam"),
      awayScore: fullTimeScore(raw, "awayteam"),
      status: toMatchStatus(raw["match_status"], raw["match_live"]),
      venue: str(raw["match_stadium"]),
    });
  }
  return matches;
}

export function parseStandings(body: Buffer, leagueId: string, year: string): ParsedStanding[] {
  const payload: unknown = JSON.parse(body.toString("utf8"));
  if (!Array.isArray(payload)) return [];

  const standings: ParsedStanding[] = [];
  for (const raw of payload as Record<string, unknown>[]) {
    if (str(raw["league_id"]) !== leagueId) continue;

    const teamName = str(raw["team_name"]);
    const position = int(raw["overall_league_position"]);
    if (!teamName || position === null) continue;

    const stageName = str(raw["stage_name"]);
    standings.push({
      season: seasonLabel(year, stageName),
      stage: stageName,
      teamName,
      teamRef: str(raw["team_id"]),
      canonical: resolveTeamName(teamName) ?? null,
      position,
      played: int(raw["overall_league_payed"]) ?? 0, // their spelling, not ours
      won: int(raw["overall_league_W"]) ?? 0,
      drawn: int(raw["overall_league_D"]) ?? 0,
      lost: int(raw["overall_league_L"]) ?? 0,
      goalsFor: int(raw["overall_league_GF"]) ?? 0,
      goalsAgainst: int(raw["overall_league_GA"]) ?? 0,
      points: int(raw["overall_league_PTS"]) ?? 0,
    });
  }
  return standings;
}
