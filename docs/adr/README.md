# Architecture Decision Records

Anything structural gets an ADR. "Structural" means: it constrains what future
contributors can do, or it would be expensive to reverse.

Numbered sequentially, never renumbered. ADRs are **immutable once accepted** — if a
decision changes, write a new ADR that supersedes the old one and mark the old one
`Superseded by ADR NNNN`. The record of what we thought at the time is the point.

Copy [`template.md`](template.md) to start one.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-monorepo-pnpm-turborepo.md) | Monorepo with pnpm workspaces + Turborepo | Accepted |
| [0002](0002-postgres-serving-db.md) | Postgres as the serving database | Accepted |
| [0003](0003-redpanda-as-log.md) | Redpanda as the Kafka-compatible log | Accepted (Phase 2) |
| [0004](0004-avro-schemas.md) | Avro schemas from day 1 | Accepted |
| [0005](0005-raw-first-ingestion.md) | Raw-first ingestion | Accepted (Phase 2) |
| [0006](0006-react-router-ssr-web.md) | React Router framework mode, SSR | Accepted |
| 0007 | *Why we need a streaming layer* — write **before** Phase 2 code | Not started |
| [0008](0008-provenance-observations-first.md) | Provenance: observations first, canonical facts in Phase 2 | Accepted |
