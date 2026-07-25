import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "./rate-limiter.ts";

test("first request is immediate", async () => {
  const started = Date.now();
  await new RateLimiter(50).acquire();
  assert.ok(Date.now() - started < 25, "should not delay the first call");
});

test("consecutive requests are spaced by the minimum interval", async () => {
  const limiter = new RateLimiter(40);
  const started = Date.now();
  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();
  const elapsed = Date.now() - started;
  // Two gaps of 40ms; allow slack for timer granularity.
  assert.ok(elapsed >= 70, `expected >= 70ms of spacing, got ${elapsed}ms`);
});

test("concurrent callers queue rather than firing together", async () => {
  const limiter = new RateLimiter(30);
  const at: number[] = [];
  const started = Date.now();
  await Promise.all(
    [0, 1, 2].map(async () => {
      await limiter.acquire();
      at.push(Date.now() - started);
    }),
  );
  at.sort((a, b) => a - b);
  assert.ok(at[2]! >= 50, `third caller should be held back, fired at ${at[2]}ms`);
});

test("backOffUntil delays beyond the configured interval", async () => {
  const limiter = new RateLimiter(0);
  limiter.backOffUntil(Date.now() + 60);
  const started = Date.now();
  await limiter.acquire();
  assert.ok(Date.now() - started >= 45, "a 429 should slow later requests, not just the retry");
});

test("a negative interval is rejected outright", () => {
  assert.throws(() => new RateLimiter(-1), RangeError);
});
