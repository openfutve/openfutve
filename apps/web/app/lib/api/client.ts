import type {
  MatchObservation,
  MatchesQuery,
  Paginated,
  Single,
  StandingsQuery,
  StandingsSnapshot,
  Team,
  TeamsQuery,
} from "./types.ts";

/**
 * A typed client for `apps/api`.
 *
 * ADR 0006: the web app reaches the API over HTTP and never imports database
 * code, and loaders use web-standard APIs only — `fetch`, `URL`,
 * `URLSearchParams`, `AbortSignal` — so this module runs unchanged on Node or
 * on a Workers-style runtime. Nothing here may import from `node:`.
 */

/**
 * A request that did not produce a usable response.
 *
 * `status` is the HTTP status, or `null` when the request never got that far
 * (DNS failure, connection refused, timeout). Routes distinguish the two: a 404
 * is "no data for this season", a `null` status is "the API is down", and those
 * are different things to tell a reader.
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly url: string;

  constructor(message: string, url: string, status: number | null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
  }

  /** True when the API could not be reached at all, rather than answering badly. */
  get isUnreachable(): boolean {
    return this.status === null;
  }
}

export interface ApiClientOptions {
  /** Root of the API, e.g. `http://localhost:3001`. Trailing slash optional. */
  baseUrl: string;
  /**
   * Injected for tests and for runtimes that bind `fetch` to a request scope.
   * Defaults to the global.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * Server rendering blocks on this, so it has to be short: a slow API should
   * degrade the page, not hold the response open. Defaults to 5s.
   */
  timeoutMs?: number;
}

export interface ApiClient {
  listTeams(query?: TeamsQuery): Promise<Paginated<Team>>;
  listMatches(query?: MatchesQuery): Promise<Paginated<MatchObservation>>;
  getStandings(query: StandingsQuery): Promise<Single<StandingsSnapshot>>;
}

/** Drops `undefined` and empty values so the URL carries only real filters. */
function toSearchParams(query: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  // Stable order keeps URLs cacheable and test assertions readable.
  params.sort();
  return params;
}

export function buildUrl(baseUrl: string, path: string, query: Record<string, unknown> = {}): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  url.search = toSearchParams(query).toString();
  return url.toString();
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, fetch: fetchImpl = globalThis.fetch, timeoutMs = 5_000 } = options;

  async function request<T>(path: string, query: Record<string, unknown>): Promise<T> {
    const url = buildUrl(baseUrl, path, query);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      // Timeouts arrive here as an AbortError; both mean "no answer".
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new ApiError(`api unreachable: ${reason}`, url, null, { cause });
    }

    if (!response.ok) {
      throw new ApiError(`api returned ${response.status}`, url, response.status);
    }

    try {
      return (await response.json()) as T;
    } catch (cause) {
      // A 200 that isn't JSON is a broken API, not an empty result — say so
      // rather than rendering a blank page.
      throw new ApiError("api returned a malformed body", url, response.status, { cause });
    }
  }

  return {
    listTeams: (query = {}) => request<Paginated<Team>>("/teams", { ...query }),
    listMatches: (query = {}) => request<Paginated<MatchObservation>>("/matches", { ...query }),
    getStandings: (query) => request<Single<StandingsSnapshot>>("/standings", { ...query }),
  };
}
