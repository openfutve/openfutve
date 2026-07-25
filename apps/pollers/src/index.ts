import { runPoller } from "./framework/runner.ts";
import { logger } from "./framework/logger.ts";
import { SourceGuardError } from "./framework/guards.ts";
import { selfcheckPoller } from "./pollers/selfcheck.ts";
import type { Poller } from "./framework/context.ts";

/** Every poller the CLI can run. New sources register here. */
const REGISTRY: Poller[] = [selfcheckPoller];

function usage(): string {
  const rows = REGISTRY.map((p) => `  ${p.key.padEnd(14)} ${p.describe}`).join("\n");
  return [
    "Usage: pollers <name> [options]",
    "",
    "Pollers:",
    rows,
    "",
    "Options:",
    "  --dry-run           Fetch and parse, write nothing",
    "  --force             Run a source whose audit is incomplete (active = false)",
    "  --allow-unaudited   Run a source whose licence is unknown; raw archive only",
    "  --min-interval=MS   Minimum gap between requests (default 1000)",
  ].join("\n");
}

async function main(): Promise<void> {
  const [name, ...flags] = process.argv.slice(2);

  if (!name || name === "--help" || name === "-h") {
    console.log(usage());
    process.exit(name ? 0 : 1);
  }

  const poller = REGISTRY.find((p) => p.key === name);
  if (!poller) {
    console.error(`unknown poller '${name}'\n\n${usage()}`);
    process.exit(1);
  }

  const intervalFlag = flags.find((f) => f.startsWith("--min-interval="));

  try {
    await runPoller(poller, {
      dryRun: flags.includes("--dry-run"),
      force: flags.includes("--force"),
      allowUnaudited: flags.includes("--allow-unaudited"),
      ...(intervalFlag ? { minIntervalMs: Number(intervalFlag.split("=")[1]) } : {}),
    });
  } catch (error) {
    // Guard failures are the operator's problem to fix, not a stack trace.
    if (error instanceof SourceGuardError) {
      logger.error(error.message);
    } else {
      logger.error({ error: String(error) }, "poller run failed");
    }
    process.exit(1);
  }
}

await main();
