// Team alias table — the mapping from "what a source calls a club" to one
// canonical identity.
//
// Seeded 2026-07-25 from names actually returned by the sources, not invented:
//   - ligafutve.org  /wp-json/sportspress/v2/teams  (league 20, «B» sides excluded)
//   - APIfootball.com  get_standings&league_id=337  (2026 Apertura)
//
// ⚠️ This table is currently doing double duty as the Primera scope guard.
// APIfootball tags Segunda and reserve fixtures as "Primera División", and the
// only thing keeping them out of our data is that their names do not resolve
// here (see docs/data-sources.md). Adding a Segunda club while working on #13
// would silently widen our scope.
//
// This is the Phase 1 stand-in for what becomes Flink entity resolution in
// Phase 2 (ADR 0008). It covers the CURRENT top flight only. Historical clubs —
// renames, mergers, defunct sides across 90 years of Wikipedia data — arrive via
// issue #13, driven by the unresolved-name log rather than guesswork.

/** A club identity and every spelling we have seen for it. */
export interface TeamAlias {
  /** The name we display. Chosen from the official source where one exists. */
  canonical: string;
  /** Source-specific identifiers, where known. */
  refs: {
    /** SportsPress post id on ligafutve.org. */
    ligafutve?: number;
    /** team_id on APIfootball.com. */
    apifootball?: string;
  };
  /** Every observed spelling, including the canonical one. Matched after normalisation. */
  aliases: string[];
  /** Anything a future reader would otherwise have to re-derive. */
  note?: string;
}

/**
 * Clubs in the 2026 Primera División.
 *
 * Both sources were cross-checked: APIfootball's 2026 standings list 14 clubs,
 * ligafutve.org lists 19 for league 20 — the extra five are sides no longer in
 * the top flight, kept below under `HISTORICAL` because the archive still
 * references them.
 */
export const TEAM_ALIASES: TeamAlias[] = [
  {
    canonical: "Academia Puerto Cabello FC",
    refs: { ligafutve: 3445 },
    aliases: ["Academia Puerto Cabello FC", "Academia Puerto Cabello", "Puerto Cabello", "AP Cabello"],
  },
  {
    canonical: "Anzoátegui FC",
    refs: {},
    aliases: ["Anzoátegui FC", "Anzoategui FC", "Anzoátegui", "Anzoategui"],
    note: "APIfootball drops the accent. Normalisation handles it; listed for clarity.",
  },
  {
    canonical: "Carabobo FC",
    refs: {},
    aliases: ["Carabobo FC", "Carabobo"],
    note: "ligafutve.org returns TWO distinct team records both titled 'Carabobo FC' — a duplicate in their data. Resolve to one identity; see issue #13.",
  },
  {
    canonical: "Caracas FC",
    refs: {},
    aliases: ["Caracas FC", "Caracas"],
  },
  {
    canonical: "Deportivo La Guaira FC",
    refs: {},
    aliases: ["Deportivo La Guaira FC", "Deportivo La Guaira", "Dep. La Guaira", "La Guaira"],
  },
  {
    canonical: "Deportivo Rayo Zuliano",
    refs: {},
    aliases: ["Deportivo Rayo Zuliano", "Rayo Zuliano"],
  },
  {
    canonical: "Deportivo Táchira FC",
    refs: {},
    aliases: ["Deportivo Táchira FC", "Deportivo Tachira", "Dep. Táchira", "Dep. Tachira", "Táchira", "Tachira"],
  },
  {
    canonical: "Estudiantes de Mérida FC",
    refs: {},
    aliases: ["Estudiantes de Mérida FC", "Estudiantes de Merida", "Estudiantes Mérida", "Estudiantes Merida"],
  },
  {
    canonical: "Metropolitanos FC",
    refs: {},
    aliases: ["Metropolitanos FC", "Metropolitanos"],
  },
  {
    canonical: "Monagas SC",
    refs: {},
    aliases: ["Monagas SC", "Monagas"],
  },
  {
    canonical: "Portuguesa FC",
    refs: {},
    aliases: ["Portuguesa FC", "Portuguesa"],
  },
  {
    canonical: "UCV FC",
    refs: {},
    aliases: ["UCV FC", "UCV", "Universidad Central", "Universidad Central de Venezuela"],
    note: "UCV = Universidad Central de Venezuela. APIfootball spells it out; ligafutve.org abbreviates.",
  },
  {
    canonical: "Trujillanos FC",
    refs: {},
    aliases: ["Trujillanos FC", "Trujillanos"],
    note: "Promoted for 2026 after four years away, so it appears in APIfootball's 2026 standings but not in ligafutve.org's league-20 list, whose feed stopped in July 2025.",
  },
  {
    canonical: "Zamora FC",
    refs: {},
    aliases: ["Zamora FC", "Zamora"],
    note: "Distinct from 'Zamora FC «B»', which is a reserve side and out of scope.",
  },
];

/**
 * Clubs present in the ligafutve.org archive but not in the 2026 top flight.
 * Needed to resolve historical observations; not part of the current season.
 */
export const HISTORICAL_TEAM_ALIASES: TeamAlias[] = [
  { canonical: "Atlético Venezuela CF", refs: {}, aliases: ["Atlético Venezuela CF", "Atletico Venezuela", "Atl. Venezuela"] },
  { canonical: "Gran Valencia FC", refs: {}, aliases: ["Gran Valencia FC", "Gran Valencia"] },
  { canonical: "Inter de Barinas", refs: {}, aliases: ["Inter de Barinas", "Inter Barinas"] },
  { canonical: "Lala FC", refs: {}, aliases: ["Lala FC", "Lala"] },
  { canonical: "Yaracuyanos FC", refs: {}, aliases: ["Yaracuyanos FC", "Yaracuyanos"] },
];

const ALL = [...TEAM_ALIASES, ...HISTORICAL_TEAM_ALIASES];

/**
 * Normalise a team name for comparison: strip accents and punctuation, drop the
 * club-type suffixes sources add inconsistently (FC, SC, CF, CD), collapse
 * whitespace, lowercase.
 *
 * Deliberately NOT fuzzy. A near-miss must fail loudly and land in the
 * unresolved log rather than be silently matched to the wrong club — under
 * ADR 0008 a wrong resolution is far more expensive than an unresolved row.
 */
export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[«»".,'’]/g, "")
    .replace(/\b(fc|sc|cf|cd|ac)\b/g, "")
    .replace(/\bdep\b/g, "deportivo")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const INDEX: ReadonlyMap<string, string> = new Map(
  ALL.flatMap((team) => team.aliases.map((alias) => [normalizeTeamName(alias), team.canonical] as const)),
);

/**
 * Resolve a source's spelling to a canonical club name.
 * Returns `undefined` when unknown — callers must log that, not guess.
 */
export function resolveTeamName(name: string): string | undefined {
  return INDEX.get(normalizeTeamName(name));
}

/** True when the name is a reserve side («B»), which is out of scope. */
export function isReserveSide(name: string): boolean {
  return /«\s*b\s*»|\bii\b|\bb\b$/i.test(name.trim());
}
