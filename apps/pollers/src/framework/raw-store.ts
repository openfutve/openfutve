import { createHash } from "node:crypto";
import type pg from "pg";
import type { FetchResult } from "./fetcher.ts";

export interface StoredPayload {
  /** FK for every row parsed out of these bytes (ADR 0008). */
  rawPayloadId: number;
  body: Buffer;
  fetchedAt: Date;
  /** True when identical bytes were already stored — an unchanged page is not new data. */
  deduped: boolean;
}

export function sha256(body: Buffer): Buffer {
  return createHash("sha256").update(body).digest();
}

/**
 * Persist the unparsed payload before anything interprets it (ADR 0005).
 *
 * Deduplicated on (source, endpoint, sha256): re-fetching an unchanged page
 * returns the existing row rather than growing the archive. That is what makes
 * polling cheap enough to do politely.
 */
export async function storeRawPayload(
  db: pg.ClientBase,
  params: { source: string; endpoint: string; fetch: FetchResult },
): Promise<StoredPayload> {
  const { source, endpoint, fetch: result } = params;
  const digest = sha256(result.body);

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO raw_payloads
       (source, endpoint, request_url, http_status, content_type, body, body_sha256, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (source, endpoint, body_sha256) DO NOTHING
     RETURNING id`,
    [source, endpoint, result.url, result.status, result.contentType, result.body, digest, result.fetchedAt],
  );

  if (inserted.rows.length > 0) {
    return { rawPayloadId: Number(inserted.rows[0]!.id), body: result.body, fetchedAt: result.fetchedAt, deduped: false };
  }

  const existing = await db.query<{ id: string; fetched_at: Date }>(
    `SELECT id, fetched_at FROM raw_payloads
      WHERE source = $1 AND endpoint = $2 AND body_sha256 = $3`,
    [source, endpoint, digest],
  );
  const row = existing.rows[0];
  if (!row) throw new Error(`raw payload vanished mid-insert for ${source}/${endpoint}`);

  return { rawPayloadId: Number(row.id), body: result.body, fetchedAt: row.fetched_at, deduped: true };
}
