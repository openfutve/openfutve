import pino from "pino";

/**
 * Structured JSON logs. Machine-readable from day one because Phase 1's
 * observability (#22) ships them to Loki, and retro-fitting structure onto
 * printf logging is miserable.
 */
export const logger = pino({
  level: process.env["POLLER_LOG_LEVEL"] ?? "info",
  base: null, // no pid/hostname noise; the container already tells us that
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = pino.Logger;
