import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, buildUrl, createApiClient } from "./client.ts";

/** A `fetch` stand-in that records what it was asked for and replays a scripted answer. */
function stubFetch(reply: () => Promise<Response> | Response) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return reply();
  }) as typeof globalThis.fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("query parameters that are absent do not reach the URL", () => {
  const url = buildUrl("http://api.test", "/matches", {
    season: "2025-C",
    team: undefined,
    from: "",
    limit: 20,
  });
  assert.equal(url, "http://api.test/matches?limit=20&season=2025-C");
});

test("a base URL with a trailing slash or a path prefix is preserved", () => {
  assert.equal(buildUrl("http://api.test/", "/teams", {}), "http://api.test/teams");
  assert.equal(buildUrl("http://api.test/v1/", "teams", {}), "http://api.test/v1/teams");
});

test("filters are passed through to the endpoint", async () => {
  const { impl, calls } = stubFetch(() =>
    json({ data: [], page: { limit: 50, next_cursor: null }, meta: { source: "ligafutve", generated_at: "" } }),
  );
  const api = createApiClient({ baseUrl: "http://api.test", fetch: impl });

  await api.listMatches({ season: "2025-C", from: "2025-07-01", to: "2025-07-31", status: "finished" });

  assert.equal(
    calls[0],
    "http://api.test/matches?from=2025-07-01&season=2025-C&status=finished&to=2025-07-31",
  );
});

test("a decoded page keeps its envelope", async () => {
  const payload = {
    data: [{ id: "t1", canonical_name: "Caracas FC", short_name: "CFC" }],
    page: { limit: 50, next_cursor: "eyJvIjo1MH0" },
    meta: { source: "ligafutve", generated_at: "2026-09-10T00:00:00.000Z" },
  };
  const { impl } = stubFetch(() => json(payload));
  const api = createApiClient({ baseUrl: "http://api.test", fetch: impl });

  const page = await api.listTeams();

  assert.equal(page.data[0]?.canonical_name, "Caracas FC");
  assert.equal(page.page.next_cursor, "eyJvIjo1MH0");
  assert.equal(page.meta.source, "ligafutve");
});

test("an error status surfaces as ApiError with the status intact", async () => {
  const { impl } = stubFetch(() => json({ error: "no such season" }, 404));
  const api = createApiClient({ baseUrl: "http://api.test", fetch: impl });

  const error = await api.getStandings({ season: "1899" }).catch((e: unknown) => e);

  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 404);
  assert.equal(error.isUnreachable, false);
});

test("a transport failure is reported as unreachable, not as a status", async () => {
  const { impl } = stubFetch(() => {
    throw new TypeError("fetch failed");
  });
  const api = createApiClient({ baseUrl: "http://api.test", fetch: impl });

  const error = await api.listTeams().catch((e: unknown) => e);

  assert.ok(error instanceof ApiError);
  assert.equal(error.status, null);
  assert.equal(error.isUnreachable, true);
  assert.match(error.message, /fetch failed/);
});

test("a 200 that is not JSON is an error rather than an empty page", async () => {
  const { impl } = stubFetch(() => new Response("<html>maintenance</html>", { status: 200 }));
  const api = createApiClient({ baseUrl: "http://api.test", fetch: impl });

  const error = await api.listTeams().catch((e: unknown) => e);

  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 200);
  assert.match(error.message, /malformed/);
});

test("a slow API times out instead of holding the render open", async () => {
  // Honours the abort signal the way a real fetch does; without that the client
  // would be waiting on the stub rather than on its own timeout.
  const impl = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(json({})), 1_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(init.signal!.reason);
      });
    })) as typeof globalThis.fetch;
  const api = createApiClient({ baseUrl: "http://api.test", fetch: impl, timeoutMs: 10 });

  const error = await api.listTeams().catch((e: unknown) => e);

  assert.ok(error instanceof ApiError);
  assert.equal(error.isUnreachable, true);
});
