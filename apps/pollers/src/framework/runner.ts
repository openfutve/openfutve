import pg from "pg";
import type { Poller, PollerResult } from "./context.ts";
import { createContext } from "./context.ts";
import { Fetcher } from "./fetcher.ts";
import { assertSourcePollable } from "./guards.ts";
import { logger as rootLogger } from "./logger.ts";
import { RateLimiter } from "./rate-limiter.ts";

export interface RunOptions {
  dryRun?: boolean;
  force?: boolean;
  allowUnaudited?: boolean;
  /** Minimum gap between requests to this source. Defaults to a polite 1s. */
  minIntervalMs?: number;
}

/**
 * Run one poller: check the guards, build its context, execute, report.
 *
 * Invocation-driven on purpose. Each run is a one-shot command, so scheduling
 * stays external (cron, a GitHub Actions schedule, or systemd on the homelab)
 * until there is a homelab to schedule on. Phase 3's match-window scheduler is
 * a different problem and gets built when live matches need it, not now.
 */
export async function runPoller(poller: Poller, options: RunOptions = {}): Promise<PollerResult> {
  const { dryRun = false, force = false, allowUnaudited = false, minIntervalMs = 1000 } = options;

  const userAgent = process.env["POLLER_USER_AGENT"];
  if (!userAgent) {
    // Identifying the bot is non-negotiable. Refuse before touching the network.
    throw new Error("POLLER_USER_AGENT is not set; refusing to run");
  }
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is not set; refusing to run");

  const logger = rootLogger.child({ poller: poller.key, source: poller.source });
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();

  const startedAt = Date.now();
  let fetched = 0;
  let deduped = 0;

  try {
    const source = await assertSourcePollable(db, poller.source, { force, allowUnaudited });
    logger.info({ source: source.name, license: source.license, dryRun, minIntervalMs }, "poller starting");

    const fetcher = new Fetcher({ userAgent, rateLimiter: new RateLimiter(minIntervalMs), logger });
    const ctx = createContext({
      source: poller.source,
      db,
      fetcher,
      logger,
      dryRun,
      onFetch: (stored) => {
        fetched += 1;
        if (stored.deduped) deduped += 1;
      },
    });

    const result = await poller.run(ctx);
    const summary: PollerResult = { ...result, fetched, deduped };

    logger.info({ ...summary, durationMs: Date.now() - startedAt }, "poller finished");
    return summary;
  } catch (error) {
    logger.error({ error: String(error), durationMs: Date.now() - startedAt }, "poller failed");
    throw error;
  } finally {
    await db.end().catch(() => {});
  }
}
