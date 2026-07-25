import type pg from "pg";

export interface SourceRow {
  key: string;
  name: string;
  active: boolean;
  license: "odbl-eligible" | "cc-by-sa" | "restricted" | "unknown";
}

export class SourceGuardError extends Error {}

/**
 * Refuse to poll a source that has not cleared its audit.
 *
 * `docs/data-sources.md` says a source is only switched on once its entry is
 * complete and its licence is known. That was a sentence in a document until
 * now; here it is a precondition. Same reasoning as the compose preflight —
 * a rule nothing enforces is a rule that gets forgotten at 1am.
 */
export async function assertSourcePollable(
  db: pg.ClientBase,
  sourceKey: string,
  options: { force?: boolean; allowUnaudited?: boolean } = {},
): Promise<SourceRow> {
  const { rows } = await db.query<SourceRow>(
    `SELECT key, name, active, license FROM sources WHERE key = $1`,
    [sourceKey],
  );
  const source = rows[0];

  if (!source) {
    throw new SourceGuardError(
      `source '${sourceKey}' is not registered. Add it to packages/db/db/seeds and document it in docs/data-sources.md first.`,
    );
  }

  if (source.license === "unknown" && !options.allowUnaudited) {
    throw new SourceGuardError(
      `source '${sourceKey}' has license = 'unknown': its terms of service have not been read, ` +
        `so nothing sourced here may be published. Read the ToS and record it in docs/data-sources.md, ` +
        `or pass --allow-unaudited to fetch into the raw archive only.`,
    );
  }

  if (!source.active && !options.force) {
    throw new SourceGuardError(
      `source '${sourceKey}' is registered but not active. Set active = true in the seed once its audit ` +
        `is complete, or pass --force for a one-off run.`,
    );
  }

  return source;
}
