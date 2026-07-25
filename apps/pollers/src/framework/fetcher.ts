import robotsParserModule from "robots-parser";

/** Only the part of robots-parser we use. Its published types do not survive NodeNext. */
interface RobotsRules {
  isAllowed(url: string, userAgent?: string): boolean | undefined;
}
const robotsParser = robotsParserModule as unknown as (url: string, contents: string) => RobotsRules;
import type { Logger } from "./logger.ts";
import { RateLimiter, sleep } from "./rate-limiter.ts";
import { DEFAULT_RETRY_POLICY, decideForError, decideForResponse, type RetryPolicy } from "./retry.ts";

export interface FetchResult {
  url: string;
  status: number;
  contentType: string | null;
  body: Buffer;
  fetchedAt: Date;
  /** True when the server answered 304 and we already had the bytes. */
  notModified: boolean;
}

export interface FetcherOptions {
  userAgent: string;
  rateLimiter: RateLimiter;
  logger: Logger;
  retryPolicy?: RetryPolicy;
  /** Check robots.txt before fetching. Default true; see README scraping ethics. */
  respectRobots?: boolean;
}

/**
 * The only way a poller is allowed to reach the network.
 *
 * It enforces, rather than documents:
 *   - the project User-Agent on every request
 *   - per-source rate limiting
 *   - robots.txt
 *   - retry with backoff, honouring Retry-After
 *
 * A poller receives one of these already configured, so there is no code path
 * where a source gets hit anonymously or unthrottled.
 */
export class Fetcher {
  readonly #userAgent: string;
  readonly #rateLimiter: RateLimiter;
  readonly #logger: Logger;
  readonly #retryPolicy: RetryPolicy;
  readonly #respectRobots: boolean;
  readonly #robotsCache = new Map<string, RobotsRules | null>();

  constructor(options: FetcherOptions) {
    if (!options.userAgent?.trim()) {
      // Identifying the bot is non-negotiable (README). Fail loudly at construction.
      throw new Error("Fetcher requires a non-empty userAgent");
    }
    this.#userAgent = options.userAgent;
    this.#rateLimiter = options.rateLimiter;
    this.#logger = options.logger;
    this.#retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.#respectRobots = options.respectRobots ?? true;
  }

  async get(url: string, headers: Record<string, string> = {}): Promise<FetchResult> {
    if (this.#respectRobots && !(await this.#isAllowed(url))) {
      throw new Error(`robots.txt disallows ${url} for ${this.#userAgent}`);
    }

    let attempt = 0;
    for (;;) {
      attempt += 1;
      await this.#rateLimiter.acquire();

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { "user-agent": this.#userAgent, accept: "application/json, text/html;q=0.9", ...headers },
          redirect: "follow",
        });
      } catch (error) {
        const decision = decideForError(error, attempt, this.#retryPolicy);
        if (decision.action !== "retry") throw new Error(`fetch failed: ${decision.reason}`);
        this.#logger.warn({ url, attempt, delayMs: decision.delayMs, reason: decision.reason }, "retrying");
        await sleep(decision.delayMs);
        continue;
      }

      if (response.status === 304) {
        return { url, status: 304, contentType: null, body: Buffer.alloc(0), fetchedAt: new Date(), notModified: true };
      }

      const decision = decideForResponse(response.status, response.headers.get("retry-after"), attempt, this.#retryPolicy);

      if (decision.action === "succeed") {
        const body = Buffer.from(await response.arrayBuffer());
        return {
          url,
          status: response.status,
          contentType: response.headers.get("content-type"),
          body,
          fetchedAt: new Date(),
          notModified: false,
        };
      }

      if (decision.action === "fail") throw new Error(`fetch failed: ${decision.reason} (${url})`);

      // A 429 slows every later request to this source, not just this retry.
      if (response.status === 429) this.#rateLimiter.backOffUntil(Date.now() + decision.delayMs);
      this.#logger.warn({ url, attempt, delayMs: decision.delayMs, reason: decision.reason }, "retrying");
      await sleep(decision.delayMs);
    }
  }

  async #isAllowed(url: string): Promise<boolean> {
    const origin = new URL(url).origin;

    if (!this.#robotsCache.has(origin)) {
      try {
        const response = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": this.#userAgent } });
        this.#robotsCache.set(
          origin,
          response.ok ? robotsParser(`${origin}/robots.txt`, await response.text()) : null,
        );
      } catch (error) {
        // Unreachable robots.txt is not permission. Log it and proceed —
        // matching the convention that a missing file means no restrictions.
        this.#logger.warn({ origin, error: String(error) }, "robots.txt unreachable, proceeding");
        this.#robotsCache.set(origin, null);
      }
    }

    const robots = this.#robotsCache.get(origin);
    if (!robots) return true;
    return robots.isAllowed(url, this.#userAgent) ?? true;
  }
}
