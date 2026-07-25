/** What the fetcher should do about a response or a thrown error. */
export type RetryDecision =
  | { action: "succeed" }
  | { action: "fail"; reason: string }
  | { action: "retry"; delayMs: number; reason: string };

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
};

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters more than it looks: without it, several pollers that fail
 * together retry together forever, which is how a struggling source gets
 * hammered at exactly the moment it is least able to cope.
 */
export function backoffDelay(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
  return Math.round(exponential * random());
}

/**
 * `Retry-After` is either delay-seconds or an HTTP-date (RFC 9110).
 * Returns milliseconds to wait, or undefined if absent/unparseable.
 */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();

  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;

  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - now);

  return undefined;
}

/**
 * Whether an HTTP response should be retried.
 *
 * 429 and 5xx are retried; 4xx (other than 429) are not, because retrying a
 * 404 or a 401 just wastes a source's quota and our time.
 */
export function decideForResponse(
  status: number,
  retryAfterHeader: string | null,
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  now: number = Date.now(),
  random: () => number = Math.random,
): RetryDecision {
  if (status >= 200 && status < 300) return { action: "succeed" };

  const retryable = status === 429 || status >= 500;
  if (!retryable) return { action: "fail", reason: `HTTP ${status}` };
  if (attempt >= policy.maxAttempts) {
    return { action: "fail", reason: `HTTP ${status} after ${attempt} attempts` };
  }

  // An explicit Retry-After always wins over our computed backoff.
  const retryAfter = parseRetryAfter(retryAfterHeader, now);
  const delayMs = retryAfter ?? backoffDelay(attempt, policy, random);
  return { action: "retry", delayMs, reason: `HTTP ${status}` };
}

/** Whether a transport-level error (DNS, reset, timeout) should be retried. */
export function decideForError(
  error: unknown,
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): Extract<RetryDecision, { action: "retry" | "fail" }> {
  if (attempt >= policy.maxAttempts) {
    return { action: "fail", reason: `${String(error)} after ${attempt} attempts` };
  }
  return { action: "retry", delayMs: backoffDelay(attempt, policy, random), reason: String(error) };
}
