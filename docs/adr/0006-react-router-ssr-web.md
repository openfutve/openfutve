# ADR 0006 — `apps/web`: React Router framework mode, SSR, with prerendered posts

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Salvador

## Context

`apps/web` has two audiences with different needs:

- **Published analysis posts** — Edder's work. These must be shareable, indexable by search
  engines, and fast on a phone on a bad connection. They change only at build time.
- **Dashboard and live-match views** — data-driven, and from Phase 3 driven by a WebSocket
  feed. These cannot be static.

Whatever we choose must also fit the self-hosting story: `docker compose up` has to bring up
the web app like any other service, with no vendor-specific runtime.

## Decision

**React Router in framework mode with SSR**, served by its Node server, running as a
container in compose.

- Analysis post routes are **prerendered at build time**.
- Dashboard and live-match routes stay loader-driven, plus WebSocket from Phase 3.
- Loaders use **web-standard APIs only** (`Request`/`Response`, `fetch`) — no
  Node-only globals — so a future Cloudflare Workers deploy stays open.
- Loaders call `apps/api` **over HTTP**. `apps/web` never imports database code.

## Rationale

- **The SSR server is just another container.** No serverless adapter, no edge-runtime
  contortions, no split between "what works locally" and "what works deployed". This is the
  single biggest reason over the alternatives.
- **Prerendering gives posts what they need** — SEO and instant loads — without a second
  static-site generator in the repo, and without making the dashboard static too.
- **The HTTP-only rule is a forcing function.** If the web app can build every page from the
  public API, then the public API is genuinely sufficient for third parties. The moment we
  let the web app reach into Postgres, the public API silently becomes second-class. This
  constraint is the API's continuous integration test.
- Web-standard loader APIs cost nothing today and preserve a real deployment option.

## Alternatives considered

- **SPA mode.** Simplest to deploy (static files), but posts get no SEO and no fast first
  paint — which defeats the point of publishing analysis. Rejected.
- **Next.js.** Capable of all of the above, but its self-hosting story carries more caveats
  and its rendering model is heavier to teach than the loader/action model.
- **A separate static generator for posts + SPA dashboard.** Two toolchains, two deploy
  paths, shared components duplicated. Rejected as unjustified complexity.

## Consequences

- **`web#build` must not depend on `api` in `turbo.json`.** They are coupled at *runtime*,
  not at build time. Declaring the dependency would serialize CI for no benefit and imply a
  relationship that doesn't exist. Prerendering fetches from a running API or from fixtures
  — never from an API build output. This is easy to get wrong; call it out in review.
- Prerendered posts are only as fresh as the last build. Publishing a post means a deploy —
  acceptable, since posts are versioned artifacts, and it keeps reproducibility honest.
- The API must be up for the dashboard to render server-side. Loaders need real error and
  degraded states from day 1, not as a polish pass.
- A Node runtime is required in the deployment target. Accepted; it is a container either
  way.
