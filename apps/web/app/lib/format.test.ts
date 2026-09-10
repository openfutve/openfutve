import { test } from "node:test";
import assert from "node:assert/strict";
import { formatGoalDifference, formatKickoff, formatMatchDate } from "./format.ts";

test("a calendar date is not shifted a day by the venue time zone", () => {
  // Regression: `match_date` is a date, not an instant. Parsing it as midnight
  // UTC and then rendering it in America/Caracas (UTC-4) printed the day before,
  // so a Friday fixture appeared under Thursday.
  assert.match(formatMatchDate("2025-07-25"), /25/);
  assert.match(formatMatchDate("2025-01-01"), /1|01/);
  assert.match(formatMatchDate("2025-01-01"), /2025/);
});

test("a malformed date is passed through rather than rendered as Invalid Date", () => {
  assert.equal(formatMatchDate("unknown"), "unknown");
});

test("kickoff renders in the venue's clock, not the reader's", () => {
  // 23:30Z is 19:30 in Caracas — the time the league published.
  assert.equal(formatKickoff("2025-07-25T23:30:32.000Z"), "19:30");
});

test("kickoff is optional and unparseable instants do not render", () => {
  assert.equal(formatKickoff(null), null);
  assert.equal(formatKickoff("not a date"), null);
});

test("goal difference keeps its sign", () => {
  assert.equal(formatGoalDifference(12), "+12");
  assert.equal(formatGoalDifference(-3), "-3");
  assert.equal(formatGoalDifference(0), "0");
});
