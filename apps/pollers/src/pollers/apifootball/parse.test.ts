import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEvents, parseStandings, seasonLabel, toMatchStatus, fullTimeScore } from "./parse.ts";

const sample = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../../docs/samples/apifootball/${name}`, import.meta.url)));

const EVENTS = sample("events-2026-sample.json");
const STANDINGS = sample("standings-337.json");

test("parses real 2026 fixtures", () => {
  const matches = parseEvents(EVENTS, "337");
  assert.ok(matches.length > 0);

  const opener = matches.find((m) => m.sourceRef === "725413");
  assert.ok(opener, "expected the 2026-01-29 opener");
  assert.equal(opener.homeTeamName, "Dep. Tachira");
  assert.equal(opener.homeCanonical, "Deportivo Táchira FC", "alias table should resolve it");
  assert.equal(opener.awayCanonical, "Anzoátegui FC");
  assert.equal(opener.homeScore, 3);
  assert.equal(opener.awayScore, 1);
  assert.equal(opener.status, "finished");
  assert.equal(opener.matchDate, "2026-01-29");
  assert.equal(opener.matchday, 1);
  assert.equal(opener.venue, "Estadio Polideportivo de Pueblo Nuevo");
});

test("every fixture resolves to a canonical club", () => {
  // If this fails, the alias table is behind the league — see #13.
  const unresolved = parseEvents(EVENTS, "337").filter((m) => !m.homeCanonical || !m.awayCanonical);
  assert.deepEqual(
    unresolved.map((m) => [m.homeTeamName, m.awayTeamName]),
    [],
  );
});

test("other competitions are filtered out", () => {
  // 336 Segunda, 8092 Copa Venezuela, 8153 Supercopa are out of scope.
  assert.deepEqual(parseEvents(EVENTS, "336"), []);
});

test("penalty shootouts never inflate the full-time score", () => {
  // The data-dictionary rule: a 1-1 draw decided on penalties stays 1-1.
  const shootout = {
    match_hometeam_score: "4",
    match_awayteam_score: "3",
    match_hometeam_ft_score: "1",
    match_awayteam_ft_score: "1",
    match_hometeam_penalty_score: "3",
    match_awayteam_penalty_score: "2",
  };
  assert.equal(fullTimeScore(shootout, "hometeam"), 1);
  assert.equal(fullTimeScore(shootout, "awayteam"), 1);
});

test("falls back to the plain score when ft_score is absent", () => {
  assert.equal(fullTimeScore({ match_hometeam_score: "2", match_hometeam_ft_score: "" }, "hometeam"), 2);
  assert.equal(fullTimeScore({ match_hometeam_score: "", match_hometeam_ft_score: "" }, "hometeam"), null);
});

test("status mapping covers the values the feed actually uses", () => {
  assert.equal(toMatchStatus("Finished", "0"), "finished");
  assert.equal(toMatchStatus("", "0"), "scheduled");
  assert.equal(toMatchStatus("", "1"), "live");
  assert.equal(toMatchStatus("67", "1"), "live");
  assert.equal(toMatchStatus("Postponed", "0"), "postponed");
  assert.equal(toMatchStatus("Cancelled", "0"), "cancelled");
  assert.equal(toMatchStatus("Something New", "0"), "unknown");
});

test("season label takes the tournament only when the source states it", () => {
  assert.equal(seasonLabel("2026", "Apertura"), "2026-A");
  assert.equal(seasonLabel("2026", "Apertura - Quadrangular"), "2026-A");
  assert.equal(seasonLabel("2024", "Clausura"), "2024-C");
  // Events say "Current", which is not a tournament — do not guess from the date.
  assert.equal(seasonLabel("2026", "Current"), "2026");
  assert.equal(seasonLabel("2026", null), "2026");
});

test("event stage does not launder 'Current' into a real stage", () => {
  const matches = parseEvents(EVENTS, "337");
  assert.ok(matches.every((m) => m.stage === null || m.stage.toLowerCase() !== "current"));
});

test("parses the standings table with its Apertura label", () => {
  const table = parseStandings(STANDINGS, "337", "2026");
  assert.ok(table.length >= 14);

  const leader = table.find((r) => r.position === 1);
  assert.ok(leader);
  assert.equal(leader.canonical, "Deportivo La Guaira FC");
  assert.equal(leader.season, "2026-A", "standings do carry the tournament");
  assert.equal(leader.played, 13);
  assert.equal(leader.points, 27);
  assert.equal(leader.won + leader.drawn + leader.lost, leader.played, "results must sum to played");
});

test("standings rows all resolve and satisfy the schema's CHECK", () => {
  const table = parseStandings(STANDINGS, "337", "2026");
  for (const row of table) {
    assert.ok(row.canonical, `unresolved club in standings: ${row.teamName}`);
    // standings_results_sum CHECK in the schema would reject anything else.
    assert.equal(row.won + row.drawn + row.lost, row.played, `sum mismatch for ${row.teamName}`);
  }
});

test("malformed payloads yield nothing rather than throwing", () => {
  assert.deepEqual(parseEvents(Buffer.from('{"error":404}'), "337"), []);
  assert.deepEqual(parseStandings(Buffer.from("[]"), "337", "2026"), []);
});
