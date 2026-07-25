import type pg from "pg";
import type { Fetcher } from "./fetcher.ts";
import type { Logger } from "./logger.ts";
import { storeRawPayload, type StoredPayload } from "./raw-store.ts";

/**
 * What a poller is handed. Note what is absent: no raw `fetch`, no HTTP client.
 *
 * The only route to the network is `fetchAndStore`, which always persists the
 * unparsed bytes first and hands back a `rawPayloadId`. A poller therefore
 * cannot skip the raw archive (ADR 0005) or forget provenance (ADR 0008) —
 * those stop being review checklist items and become the shape of the API.
 */
export interface PollerContext {
  readonly source: string;
  readonly db: pg.ClientBase;
  readonly logger: Logger;
  /** Fetch, archive the bytes, return the id every parsed row must carry. */
  fetchAndStore(endpoint: string, url: string, headers?: Record<string, string>): Promise<StoredPayload>;
  /** True when nothing should be written. Fetching and parsing still happen. */
  readonly dryRun: boolean;
}

export interface PollerResult {
  fetched: number;
  deduped: number;
  parsed: number;
  written: number;
  unresolved: number;
}

export interface Poller {
  /** CLI name, e.g. `apifootball`. */
  readonly key: string;
  /** `sources.key` this poller writes as. Must exist and be active. */
  readonly source: string;
  readonly describe: string;
  run(ctx: PollerContext): Promise<PollerResult>;
}

export function createContext(params: {
  source: string;
  db: pg.ClientBase;
  fetcher: Fetcher;
  logger: Logger;
  dryRun: boolean;
  onFetch?: (stored: StoredPayload) => void;
}): PollerContext {
  const { source, db, fetcher, logger, dryRun, onFetch } = params;

  return {
    source,
    db,
    logger,
    dryRun,
    async fetchAndStore(endpoint, url, headers) {
      const result = await fetcher.get(url, headers);
      const stored = await storeRawPayload(db, { source, endpoint, fetch: result });
      logger.debug(
        { endpoint, url, bytes: result.body.byteLength, rawPayloadId: stored.rawPayloadId, deduped: stored.deduped },
        "fetched",
      );
      onFetch?.(stored);
      return stored;
    },
  };
}
