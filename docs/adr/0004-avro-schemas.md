# ADR 0004 — Avro schemas from day 1, in `packages/schema`

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Salvador, Edder

## Context

The core promise of this pipeline is **replay**: we keep what a source said, and we can
re-derive every downstream fact from it later, after fixing a parser or changing a
definition.

That promise is worthless without schema discipline. If a message written in month 1 can't
be read by the consumer we deploy in month 9, the archive is a pile of bytes. Schema drift
is the classic way replay-based systems rot, and it rots silently — you discover it the day
you actually need to replay.

The producers and consumers are also polyglot: TypeScript pollers and API, Java/Python
Flink jobs, Python notebooks.

## Decision

All inter-service message payloads are defined as **Avro** schemas in `packages/schema`,
which is the single source of truth. Language types are **generated** from those schemas;
no service hand-writes a type for a message it sends or receives.

Schema evolution is constrained to **backward-compatible** changes (new fields require
defaults; fields are deprecated, never removed or retyped). Breaking that rule means a new
topic and a new schema version, not an edit in place.

This applies from day 1 — during Phase 1, before Kafka exists — so the poller → Postgres
path already speaks defined types.

## Rationale

- **Avro over Protobuf:** schemas are data (JSON), which makes them readable by the analyst
  and diffable in review; the writer's schema travels with the data, which is precisely the
  property replay needs; and the Kafka/Flink ecosystem treats Avro as the default path. The
  gap versus Protobuf here is narrow, and either would work — Avro's edge is
  self-describing archives.
- **Over JSON Schema:** no compact binary encoding and much weaker evolution guarantees in
  the streaming toolchain.
- **Over "just JSON":** this is the option that quietly destroys replayability, which is the
  whole point of the project.
- Generating types means a schema change surfaces as a compile error in every consumer,
  rather than a `undefined` at 2 a.m. on a matchday.

## Consequences

- A code-generation step in the build, and generated artifacts that must not be hand-edited.
- Contributors must learn Avro's evolution rules. This is written up in
  `packages/schema/README.md`; review enforces it.
- A schema registry is **not** required in Phase 1 (no broker yet). It is expected in
  Phase 2 alongside Redpanda; until then, compatibility is enforced by a test in CI that
  checks new schemas against the previous version.
- `docs/data-dictionary.md` and the schemas must agree. The dictionary defines *meaning*,
  the schema defines *shape*; neither replaces the other.
