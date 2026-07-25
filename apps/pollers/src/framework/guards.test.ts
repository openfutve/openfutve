import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSourcePollable, SourceGuardError, type SourceRow } from "./guards.ts";

/** Minimal stand-in for a pg client: returns whatever row the test wants. */
function fakeDb(row: SourceRow | undefined) {
  return { query: async () => ({ rows: row ? [row] : [] }) } as never;
}

const audited: SourceRow = { key: "ligafutve", name: "Liga FUTVE", active: true, license: "odbl-eligible" };

test("an audited, active source is pollable", async () => {
  const source = await assertSourcePollable(fakeDb(audited), "ligafutve");
  assert.equal(source.key, "ligafutve");
});

test("an unregistered source is refused", async () => {
  await assert.rejects(() => assertSourcePollable(fakeDb(undefined), "nope"), SourceGuardError);
});

test("a source with an unread ToS is refused", async () => {
  // docs/data-sources.md says licence must be known before we poll. Enforced, not documented.
  const unaudited: SourceRow = { ...audited, key: "thesportsdb", license: "unknown" };
  await assert.rejects(() => assertSourcePollable(fakeDb(unaudited), "thesportsdb"), SourceGuardError);
  // ...but may be fetched into the raw archive with an explicit opt-in.
  await assertSourcePollable(fakeDb(unaudited), "thesportsdb", { allowUnaudited: true });
});

test("an inactive source needs --force", async () => {
  const inactive: SourceRow = { ...audited, active: false };
  await assert.rejects(() => assertSourcePollable(fakeDb(inactive), "ligafutve"), SourceGuardError);
  await assertSourcePollable(fakeDb(inactive), "ligafutve", { force: true });
});

test("--force does not bypass the licence check", async () => {
  // Forcing an inactive source is an operator choice; publishing unlicensed data is not.
  const both: SourceRow = { ...audited, active: false, license: "unknown" };
  await assert.rejects(() => assertSourcePollable(fakeDb(both), "x", { force: true }), SourceGuardError);
});
