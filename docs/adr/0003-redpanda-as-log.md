# ADR 0003 — Redpanda as the Kafka-compatible log

- **Status:** Accepted (deployed in Phase 2)
- **Date:** 2026-07-27
- **Deciders:** Salvador, Yuyo

## Context

From Phase 2, ingestion moves behind a durable log: pollers write raw payloads to
`raw.{source}` topics, Flink consumes them, and Postgres becomes a sink rather than the
first write target ([ADR 0005](0005-raw-first-ingestion.md)). This requires a
Kafka-compatible broker that Flink can consume from.

The constraint that dominates: this must run on a homelab box alongside Postgres, Flink,
Grafana and the apps, and it must come up as part of a single `docker compose up` for
self-hosters. Operational weight matters more than throughput — our peak load is a handful
of messages per second on a matchday.

## Decision

**Redpanda** as the Kafka-compatible log.

## Rationale

- **Single binary, no ZooKeeper, no JVM.** One container, one process. Apache Kafka in
  KRaft mode removed the ZooKeeper dependency too, but Redpanda still wins on memory
  footprint and on defaults that work without tuning.
- **Kafka wire-compatible.** Flink's Kafka connector, `kcat`, and every client library work
  unchanged. If Redpanda ever becomes the wrong choice, we swap the broker without touching
  producer or consumer code — the reason this decision is cheap.
- **Self-host ergonomics.** Sensible resource defaults on a small box, and `rpk` is a
  genuinely usable CLI for the debugging our team will actually do (inspecting a DLQ topic,
  replaying a partition).
- Redpanda Console gives us topic inspection out of the box, which shortens the feedback
  loop for whoever is debugging a parser.

## Alternatives considered

- **Apache Kafka (KRaft).** The default answer, and the one most transferable as a skill.
  Rejected on operational weight for a part-time team on one box: more JVM tuning, more
  memory, more moving parts for identical wire behaviour. Note that because we only use
  Kafka APIs, the team still learns Kafka.
- **NATS JetStream.** Lighter still, but not Kafka wire-compatible, so Flink integration and
  the entire tooling ecosystem get worse.
- **Postgres as a queue (e.g. `pgmq`).** Tempting given [ADR 0002](0002-postgres-serving-db.md),
  and adequate for ingestion — but it gives us no replay semantics worth the name and no
  Flink story, which is the actual point of Phase 2.

## Consequences

- Redpanda is BSL-licensed for the core product (source-available, converting to Apache-2.0
  on a delay), unlike Kafka's Apache-2.0. For our use — running it, not redistributing a
  competing service — this is not a practical constraint, but it is worth stating for
  self-hosters who care.
- We must resist Redpanda-specific APIs. Anything beyond the Kafka protocol needs its own
  ADR.
- Retention policy on `raw.*` topics is a real decision deferred to Phase 2: infinite
  retention is the replay ideal, disk on the homelab is not infinite. Expected landing
  point is long retention on `raw.*` plus a Parquet archive (Phase 4).
