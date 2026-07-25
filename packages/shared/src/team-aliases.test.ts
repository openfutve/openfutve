import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEAM_ALIASES,
  normalizeTeamName,
  resolveTeamName,
  isReserveSide,
} from "./team-aliases.ts";

test("resolves the real spellings each source returns", () => {
  // Left column: exactly what APIfootball's 2026 standings return.
  const observed: [string, string][] = [
    ["Puerto Cabello", "Academia Puerto Cabello FC"],
    ["Anzoategui FC", "Anzoátegui FC"],
    ["Carabobo", "Carabobo FC"],
    ["Caracas", "Caracas FC"],
    ["La Guaira", "Deportivo La Guaira FC"],
    ["Rayo Zuliano", "Deportivo Rayo Zuliano"],
    ["Dep. Tachira", "Deportivo Táchira FC"],
    ["Estudiantes Merida", "Estudiantes de Mérida FC"],
    ["Metropolitanos", "Metropolitanos FC"],
    ["Monagas", "Monagas SC"],
    ["Portuguesa", "Portuguesa FC"],
    ["Universidad Central", "UCV FC"],
    ["Trujillanos", "Trujillanos FC"],
    ["Zamora", "Zamora FC"],
  ];
  for (const [input, expected] of observed) {
    assert.equal(resolveTeamName(input), expected, `failed on "${input}"`);
  }
});

test("all 14 clubs of the 2026 Primera are covered", () => {
  assert.equal(TEAM_ALIASES.length, 14);
});

test("accents and club suffixes do not affect matching", () => {
  assert.equal(normalizeTeamName("Deportivo Táchira FC"), normalizeTeamName("Dep. Tachira"));
  assert.equal(normalizeTeamName("Zamora FC"), normalizeTeamName("Zamora"));
});

test("unknown names return undefined rather than a wrong guess", () => {
  // A near-miss must fail loudly: a wrong resolution is worse than none (ADR 0008).
  assert.equal(resolveTeamName("Deportivo Anzoátegui"), undefined);
  assert.equal(resolveTeamName("Real Madrid"), undefined);
  assert.equal(resolveTeamName(""), undefined);
});

test("reserve sides are detected so they can be excluded", () => {
  assert.ok(isReserveSide("Zamora FC «B»"));
  assert.ok(isReserveSide("Monagas SC «B»"));
  assert.ok(!isReserveSide("Zamora FC"));
});
