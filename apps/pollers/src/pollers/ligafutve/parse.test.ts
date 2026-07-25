import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEvents, parseSeasonTerm, seasonLabel, toTermMap, type Lookups } from "./parse.ts";

const sample = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../../docs/samples/ligafutve/${name}`, import.meta.url)));

const lookups: Lookups = {
  teams: toTermMap(sample("teams-all.json"), "title"),
  seasons: toTermMap(sample("seasons-all.json"), "name"),
  venues: toTermMap(sample("venues-all.json"), "name"),
};

test("term lists load", () => {
  assert.equal(lookups.teams.size, 46);
  assert.equal(lookups.seasons.size, 25);
  assert.ok(lookups.venues.size > 20);
});

test("season terms normalise to the data-dictionary form", () => {
  // Every real season name the API returns, and what it should become.
  const cases: [string, string, string | null][] = [
    ["Temporada 2021 Fase Grupos", "2021", "Fase Grupos"],
    ["Temporada 2021 Hexagonal A", "2021", "Hexagonal A"],
    ["Temporada 2022 Liga FUTVE Fase Regular", "2022", "Fase Regular"],
    ["Temporada 2022 Liga FUTVE Fase Final B Grupo 1", "2022", "Fase Final B Grupo 1"],
    ["Temporada 2023 Liga FUTVE Fase Regular", "2023", "Fase Regular"],
    ["Torneo Apertura Temporada 2024 Fase Regular", "2024-A", "Fase Regular"],
    ["Torneo Clausura Temporada 2024 Fase Regular", "2024-C", "Fase Regular"],
    ["Cuadrangular A - Torneo Apertura Temporada 2024", "2024-A", "Cuadrangular A"],
    ["Torneo Apertura Temporada 2026 Fase Regular", "2026-A", "Fase Regular"],
  ];
  for (const [input, expectedSeason, expectedStage] of cases) {
    const term = parseSeasonTerm(input);
    assert.ok(term, `failed to parse: ${input}`);
    assert.equal(seasonLabel(term), expectedSeason, input);
    assert.equal(term.stage, expectedStage, input);
  }
});

test("Liga FUTVE 2 season terms are flagged as out of scope", () => {
  for (const name of [
    "Temporada 2022 Liga FUTVE 2 Grupo Occidental",
    "Temporada 2023 Liga FUTVE 2 - 1ra Etapa Grupo Centro-Oriental",
    "Temporada 2026 Liga FUTVE 2 Fase Regular Grupo Centro-Occidental",
  ]) {
    const term = parseSeasonTerm(name);
    assert.ok(term);
    assert.equal(term.isSecondDivision, true, name);
  }
  // ...and the first division is not caught by the same test.
  assert.equal(parseSeasonTerm("Temporada 2022 Liga FUTVE Fase Regular")!.isSecondDivision, false);
});

test("every season term the API returns is parseable", () => {
  // If the league invents a new naming style, this fails rather than silently
  // dropping a season.
  for (const [id, name] of lookups.seasons) {
    assert.ok(parseSeasonTerm(name), `unparseable season term ${id}: "${name}"`);
  }
});

test("a season term with no year is rejected rather than guessed", () => {
  assert.equal(parseSeasonTerm("Torneo Apertura Fase Regular"), null);
  assert.equal(parseSeasonTerm(""), null);
});

test("parses real events, home side first", () => {
  const matches = parseEvents(sample("events-trimmed.json"), lookups, 20);
  assert.ok(matches.length > 0);

  const played = matches.filter((m) => !m.skip);
  assert.ok(played.length > 0, "expected at least one in-scope match");

  for (const m of played) {
    // SportsPress puts the home team first; the title reads "Home vs. Away".
    assert.ok(m.homeCanonical, `unresolved home: ${m.homeName}`);
    assert.ok(m.awayCanonical, `unresolved away: ${m.awayName}`);
    assert.match(m.matchDate, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("kickoff_at is derived from date_gmt, unlike the APIfootball feed", () => {
  const matches = parseEvents(sample("events-trimmed.json"), lookups, 20).filter((m) => !m.skip);
  const withKickoff = matches.find((m) => m.kickoffAt);
  assert.ok(withKickoff, "expected a kickoff time");
  assert.ok(withKickoff.kickoffAt instanceof Date);
  assert.ok(!Number.isNaN(withKickoff.kickoffAt.getTime()), "date_gmt should parse as UTC");
});

test("a fixture in another league is skipped, not mislabelled", () => {
  // 234 is Liga FUTVE 2. Asking for it should reject everything tagged 20.
  const matches = parseEvents(sample("events-trimmed.json"), lookups, 234);
  assert.ok(matches.every((m) => m.skip === "not-primera"), "all should fall outside the requested league");
});

test("reserve sides are excluded by name", () => {
  const fake = Buffer.from(
    JSON.stringify([
      { id: 1, date: "2024-01-01T00:00:00", date_gmt: "2024-01-01T04:00:00", teams: [9001, 9002], leagues: [20], seasons: [286], venues: [], main_results: ["1", "0"] },
    ]),
  );
  const withReserve: Lookups = {
    ...lookups,
    teams: new Map([[9001, "Zamora FC «B»"], [9002, "Monagas SC"]]),
  };
  const [match] = parseEvents(fake, withReserve, 20);
  assert.equal(match?.skip, "reserve-side");
});

test("malformed payloads yield nothing rather than throwing", () => {
  assert.deepEqual(parseEvents(Buffer.from('{"code":"rest_no_route"}'), lookups, 20), []);
  assert.deepEqual(parseEvents(Buffer.from("[]"), lookups, 20), []);
  assert.equal(toTermMap(Buffer.from('{"x":1}'), "name").size, 0);
});
