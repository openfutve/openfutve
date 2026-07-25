import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffDelay, decideForResponse, parseRetryAfter, DEFAULT_RETRY_POLICY } from "./retry.ts";

test("2xx succeeds", () => {
  assert.deepEqual(decideForResponse(200, null, 1), { action: "succeed" });
});

test("4xx other than 429 fails without retrying", () => {
  // Retrying a 404 or 401 just burns a source's quota.
  for (const status of [400, 401, 403, 404]) {
    const decision = decideForResponse(status, null, 1);
    assert.equal(decision.action, "fail", `status ${status} should not retry`);
  }
});

test("429 and 5xx retry until the attempt budget runs out", () => {
  for (const status of [429, 500, 502, 503]) {
    assert.equal(decideForResponse(status, null, 1, DEFAULT_RETRY_POLICY, Date.now(), () => 0.5).action, "retry");
    const exhausted = decideForResponse(status, null, DEFAULT_RETRY_POLICY.maxAttempts);
    assert.equal(exhausted.action, "fail", `status ${status} should stop after the budget`);
  }
});

test("Retry-After overrides our computed backoff", () => {
  const decision = decideForResponse(429, "120", 1, DEFAULT_RETRY_POLICY, Date.now(), () => 0.5);
  assert.equal(decision.action, "retry");
  assert.equal(decision.action === "retry" && decision.delayMs, 120_000);
});

test("Retry-After accepts both seconds and HTTP-date", () => {
  const now = Date.parse("2026-07-26T12:00:00Z");
  assert.equal(parseRetryAfter("30", now), 30_000);
  assert.equal(parseRetryAfter("Sun, 26 Jul 2026 12:00:30 GMT", now), 30_000);
  assert.equal(parseRetryAfter(null, now), undefined);
  assert.equal(parseRetryAfter("nonsense", now), undefined);
  // A date in the past must not produce a negative delay.
  assert.equal(parseRetryAfter("Sun, 26 Jul 2026 11:59:00 GMT", now), 0);
});

test("backoff grows exponentially and is capped", () => {
  const noJitter = () => 1;
  assert.equal(backoffDelay(1, DEFAULT_RETRY_POLICY, noJitter), 500);
  assert.equal(backoffDelay(2, DEFAULT_RETRY_POLICY, noJitter), 1000);
  assert.equal(backoffDelay(3, DEFAULT_RETRY_POLICY, noJitter), 2000);
  assert.equal(backoffDelay(20, DEFAULT_RETRY_POLICY, noJitter), DEFAULT_RETRY_POLICY.maxDelayMs);
});

test("backoff applies jitter so simultaneous failures do not resynchronise", () => {
  const delays = [0, 0.25, 0.5, 1].map((r) => backoffDelay(3, DEFAULT_RETRY_POLICY, () => r));
  assert.deepEqual(delays, [0, 500, 1000, 2000]);
});
