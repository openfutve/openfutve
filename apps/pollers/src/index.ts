// Placeholder poller (Phase 0).
//
// It fetches nothing. Its job is to prove the compose stack wires up: the
// container starts, reaches Postgres, and sees a migrated schema.
//
// Phase 1 replaces this with the real poller framework — scheduler, per-source
// rate limiting, retries, structured logging — and the first TheSportsDB poller.
// Per ADR 0005, that framework writes the unparsed payload to raw_payloads
// before anything parses it.

import pg from "pg";

type LogLevel = "debug" | "info" | "warn" | "error";

/** Mirrors the `confidence_level` enum in packages/db. */
type ConfidenceLevel = "high" | "medium" | "low" | "disputed";

/** One row of the `sources` registry, as far as this placeholder cares. */
interface SourceRow {
  key: string;
  name: string;
  active: boolean;
  default_confidence: ConfidenceLevel;
}

function log(level: LogLevel, msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...extra }));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    log("error", `${name} is not set; refusing to start`);
    process.exit(1);
  }
  return value;
}

// Non-negotiable: we identify the bot on every outbound request. A poller that
// can't do that doesn't get to start. See README "Scraping ethics".
const userAgent = requireEnv("POLLER_USER_AGENT");
const databaseUrl = requireEnv("DATABASE_URL");

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();

  const { rows } = await client.query<SourceRow>(
    "SELECT key, name, active, default_confidence FROM sources ORDER BY key",
  );

  log("info", "poller placeholder up", {
    userAgent,
    sourcesRegistered: rows.length,
    sourcesActive: rows.filter((row) => row.active).length,
  });

  for (const row of rows) {
    log("info", "source registered", { ...row });
  }

  log("info", "nothing to poll yet — see Phase 1 issues");
} catch (error) {
  log("error", "poller placeholder failed", { error: String(error) });
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
