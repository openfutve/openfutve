import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { Fetcher } from "./fetcher.ts";
import { RateLimiter } from "./rate-limiter.ts";
import { createContext } from "./context.ts";
import { logger } from "./logger.ts";

/**
 * Integration test for the seam unit tests cannot reach:
 * Fetcher -> raw-store -> context, against a real Postgres.
 *
 * **It never touches a real source.** A local server replays a committed
 * fixture, so this is deterministic, fast, and does not put load on anyone
 * else's infrastructure on every push. Only deployed instances fetch from real
 * sources; see AGENTS.md.
 *
 * Skipped when DATABASE_URL is unset, so `pnpm test` still works on a laptop
 * with no database running.
 */
const DATABASE_URL = process.env["DATABASE_URL"];
const skip = DATABASE_URL ? false : "DATABASE_URL not set — start compose to run this";

const fixture = readFileSync(fileURLToPath(new URL("../../../../docs/samples/ligafutve/leagues.json", import.meta.url)));

let server: http.Server;
let origin: string;
let db: pg.Client;
let requestCount = 0;

before(async () => {
  if (skip) return;

  server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") {
      // Exercises the robots path for real, without asking a live host for it.
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nAllow: /\nDisallow: /private/\n");
      return;
    }
    if (req.url === "/private/secret.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
      return;
    }
    if (req.url?.startsWith("/leagues")) {
      requestCount += 1;
      res.writeHead(200, { "content-type": "application/json; charset=UTF-8" });
      res.end(fixture);
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  await db.query("DELETE FROM raw_payloads WHERE source = 'ligafutve' AND endpoint LIKE 'itest-%'");
});

after(async () => {
  if (skip) return;
  await db.query("DELETE FROM raw_payloads WHERE source = 'ligafutve' AND endpoint LIKE 'itest-%'");
  await db.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makeContext(dryRun = false) {
  return createContext({
    source: "ligafutve",
    db,
    fetcher: new Fetcher({
      userAgent: "openfutve-bot/test (+https://github.com/openfutve/openfutve)",
      rateLimiter: new RateLimiter(0),
      logger: logger.child({ test: true }),
    }),
    logger: logger.child({ test: true }),
    dryRun,
  });
}

test("fetch archives the unparsed bytes and returns an id", { skip }, async () => {
  const ctx = makeContext();
  const stored = await ctx.fetchAndStore("itest-leagues", `${origin}/leagues?per_page=5`);

  assert.ok(stored.rawPayloadId > 0, "should return a raw_payload_id");
  assert.equal(stored.deduped, false);
  assert.equal(stored.body.byteLength, fixture.byteLength);

  const { rows } = await db.query<{ bytes: number; status: number; content_type: string }>(
    `SELECT octet_length(body) AS bytes, http_status AS status, content_type FROM raw_payloads WHERE id = $1`,
    [stored.rawPayloadId],
  );
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0]!.bytes), fixture.byteLength, "stored bytes must match what was served");
  assert.equal(Number(rows[0]!.status), 200);
});

test("identical bytes dedupe to the same row", { skip }, async () => {
  const ctx = makeContext();
  const first = await ctx.fetchAndStore("itest-dedupe", `${origin}/leagues?per_page=5`);
  const second = await ctx.fetchAndStore("itest-dedupe", `${origin}/leagues?per_page=5`);

  assert.equal(second.rawPayloadId, first.rawPayloadId, "a repeat fetch must not create a second row");
  assert.equal(second.deduped, true);

  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM raw_payloads WHERE source = 'ligafutve' AND endpoint = 'itest-dedupe'`,
  );
  assert.equal(Number(rows[0]!.n), 1);
});

test("archived bytes are still valid JSON after the round trip", { skip }, async () => {
  // Replay is worthless if what comes back out is not what went in.
  const ctx = makeContext();
  const stored = await ctx.fetchAndStore("itest-roundtrip", `${origin}/leagues?per_page=5`);

  const { rows } = await db.query<{ body: Buffer }>(`SELECT body FROM raw_payloads WHERE id = $1`, [
    stored.rawPayloadId,
  ]);
  const parsed = JSON.parse(rows[0]!.body.toString("utf8"));
  assert.ok(Array.isArray(parsed), "stored payload should still parse as the JSON array we served");
  assert.ok(parsed.length > 0);
});

test("robots.txt is honoured", { skip }, async () => {
  const ctx = makeContext();
  await assert.rejects(
    () => ctx.fetchAndStore("itest-blocked", `${origin}/private/secret.json`),
    /robots\.txt disallows/,
    "a disallowed path must throw before the request is made",
  );

  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM raw_payloads WHERE endpoint = 'itest-blocked'`,
  );
  assert.equal(Number(rows[0]!.n), 0, "nothing should be archived for a blocked path");
});
