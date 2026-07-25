import type { Poller, PollerContext, PollerResult } from "../framework/context.ts";

/**
 * Reaches no network. Confirms the stack is wired: the container starts, the
 * database is reachable, and the schema is migrated and seeded.
 *
 * This is what compose runs, so `docker compose up` proves the environment
 * without touching anyone's servers. Real pollers arrive in #51 and #48.
 */
export const selfcheckPoller: Poller = {
  key: "selfcheck",
  source: "ligafutve", // registered and audited; nothing is fetched from it
  describe: "Verify database connectivity and the source registry. No network access.",

  async run(ctx: PollerContext): Promise<PollerResult> {
    const { rows } = await ctx.db.query<{
      key: string;
      name: string;
      active: boolean;
      license: string;
      default_confidence: string;
    }>(`SELECT key, name, active, license, default_confidence FROM sources ORDER BY key`);

    for (const row of rows) ctx.logger.info(row, "source registered");

    const counts = await ctx.db.query<{ table_name: string; n: string }>(
      `SELECT 'raw_payloads' AS table_name, count(*)::text AS n FROM raw_payloads
       UNION ALL SELECT 'match_observations', count(*)::text FROM match_observations
       UNION ALL SELECT 'teams', count(*)::text FROM teams
       ORDER BY table_name`,
    );
    for (const row of counts.rows) ctx.logger.info({ table: row.table_name, rows: Number(row.n) }, "table");

    ctx.logger.info(
      { registered: rows.length, active: rows.filter((r) => r.active).length },
      "selfcheck ok — nothing to poll yet, see issues #51 and #48",
    );

    return { fetched: 0, deduped: 0, parsed: 0, written: 0, unresolved: 0 };
  },
};
