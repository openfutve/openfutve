# ADR 0005 — Raw-first ingestion: pollers write unparsed payloads

- **Status:** Accepted (fully realized in Phase 2)
- **Date:** 2026-07-27
- **Deciders:** Salvador

## Context

Our sources are third-party APIs and HTML pages we do not control. Two things are certain:

1. **Our parsers will be wrong.** Team-name variants across decades, an unannounced HTML
   change, a field that means something different than we assumed.
2. **We often cannot re-fetch.** Rate limits, free-tier quotas, pages that change or vanish,
   and scraping-ethics commitments that forbid hammering a source to recover from our own
   bug.

If the poller parses on the way in and stores only the parsed result, every parser fix
requires re-scraping — which is sometimes slow, sometimes rude, and sometimes impossible.

## Decision

Pollers fetch and **store the unparsed payload**, verbatim, before any interpretation.

- **Phase 2+:** raw payloads are produced to `raw.{source}` topics; Flink Job 1 parses,
  normalizes and entity-resolves; unparseable records go to `dlq.{source}`.
- **Phase 1 (no broker yet):** the same discipline applies against Postgres — the raw
  payload plus fetch metadata is written to a raw landing table first, and parsing reads
  from there. The parser is a pure function from stored raw bytes to rows, never from a
  live HTTP response.

Every parsed fact carries `source`, `fetched_at` and `confidence`, so any row can be traced
back to the payload it came from.

## Rationale

- **Replay instead of re-scrape.** Fixing a parser becomes: deploy the fix, replay the
  archive. No load on the source, no lost history, and it works for sources that no longer
  serve the old page.
- **Parsers can evolve.** We can change what "a match event" means in month 6 and
  retroactively apply it to everything ingested since day 1.
- **Audit trail.** "What did this source claim, and when?" is answerable. That is a
  credibility requirement for an open-data project, and it is what makes source
  disagreements analyzable rather than a mystery.
- **Deterministic tests.** Stored payloads become fixtures; `tools/replay` turns real
  history into an integration test.
- It gives the analyst a real job with a real feedback loop: read the DLQ, find the pattern,
  fix the alias table.

## Consequences

- **Storage cost.** Raw HTML and JSON are bulky and largely redundant. Accepted; compressed
  and, from Phase 4, archived to Parquet on object storage.
- Parsing latency is no longer on the fetch path — an advantage for correctness, but it
  means "we ingested it" and "we understand it" are different states, and the UI/API must
  never conflate them.
- The raw archive can contain material we are not licensed to republish, so **raw topics and
  raw tables are internal**. `LICENSE-DATA` reflects this: we publish normalized and derived
  data, not verbatim upstream payloads.
- Retention on raw storage is a live decision, revisited in Phase 2
  ([ADR 0003](0003-redpanda-as-log.md)).
