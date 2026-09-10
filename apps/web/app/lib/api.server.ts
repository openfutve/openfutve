import { ApiError, createApiClient, type ApiClient } from "./api/index.ts";

/**
 * The API client loaders use, plus the one decision every loader shares: what
 * to render when the API is not there.
 *
 * ADR 0006 is explicit that "the API must be up for the dashboard to render
 * server-side [so] loaders need real error and degraded states from day 1, not
 * as a polish pass". `loadOrDegrade` is that, in one place: a loader returns
 * data or a reason, never a thrown 500, so the page keeps its navigation and
 * tells the reader what is missing.
 */

/**
 * Where `apps/api` lives — `API_PORT` in `.env.example`. The mock server in
 * `mocks/` binds the same port, so a fresh clone works with `pnpm dev` plus
 * `pnpm mock:api` before the real API exists (issue #18). In compose this is
 * set to the service name.
 */
const DEFAULT_API_URL = "http://localhost:3000";

let client: ApiClient | undefined;

export function apiClient(): ApiClient {
  client ??= createApiClient({
    baseUrl: process.env.OPENFUTVE_API_URL ?? DEFAULT_API_URL,
    timeoutMs: Number(process.env.OPENFUTVE_API_TIMEOUT_MS ?? 5_000),
  });
  return client;
}

/** Why a section of the page has no data. Drives which message the reader sees. */
export type DegradedReason = "unreachable" | "not-found" | "error";

export type Loaded<T> =
  | { ok: true; value: T }
  | { ok: false; reason: DegradedReason; detail: string };

export async function loadOrDegrade<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    // 404 is a normal answer to "standings for a season we have not ingested",
    // and reads very differently to the API being down. Everything else is ours
    // to look at, so it is logged rather than swallowed.
    const reason: DegradedReason = error.isUnreachable
      ? "unreachable"
      : error.status === 404
        ? "not-found"
        : "error";

    if (reason !== "not-found") {
      console.error(`[web] ${error.message} (${error.url})`);
    }

    return { ok: false, reason, detail: error.message };
  }
}
