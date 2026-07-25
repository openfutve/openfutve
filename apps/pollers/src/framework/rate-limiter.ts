/**
 * Per-host minimum interval between requests.
 *
 * Lives in the framework rather than in each poller precisely so an individual
 * poller cannot opt out of it. The README calls rate limiting non-negotiable;
 * this is where that becomes true rather than aspirational.
 *
 * Deliberately a simple serialised delay, not a token bucket: bursts are exactly
 * what we are trying not to do to a small federation's web server.
 */
export class RateLimiter {
  readonly #minIntervalMs: number;
  #nextAllowedAt = 0;
  /** Serialises waiters so N concurrent callers space out instead of colliding. */
  #chain: Promise<void> = Promise.resolve();

  constructor(minIntervalMs: number) {
    if (minIntervalMs < 0) throw new RangeError("minIntervalMs must be >= 0");
    this.#minIntervalMs = minIntervalMs;
  }

  get minIntervalMs(): number {
    return this.#minIntervalMs;
  }

  /** Resolves when the caller is allowed to make its request. */
  async acquire(now: () => number = Date.now): Promise<void> {
    const mine = this.#chain.then(async () => {
      const waitMs = this.#nextAllowedAt - now();
      if (waitMs > 0) await sleep(waitMs);
      this.#nextAllowedAt = Math.max(now(), this.#nextAllowedAt) + this.#minIntervalMs;
    });
    // Keep the chain alive even if a waiter rejects.
    this.#chain = mine.catch(() => {});
    return mine;
  }

  /**
   * Push the next allowed time out, e.g. after a 429 with Retry-After.
   * A source telling us to slow down outranks our own configured interval.
   */
  backOffUntil(timestampMs: number): void {
    this.#nextAllowedAt = Math.max(this.#nextAllowedAt, timestampMs);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
