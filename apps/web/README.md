# apps/web

The public web app: tabla, partidos and equipos for the Liga FUTVE Primera División.

React Router in framework mode with SSR, served by its Node server as a container in
compose — see [ADR 0006](../../docs/adr/0006-react-router-ssr-web.md).

## The two rules that shape this app

1. **It talks to `apps/api` over HTTP and never imports database code.** If a page needs a
   field, the public API needs that field. That constraint is the API's continuous
   integration test, and it is the reason the web app exists this early.
2. **It renders observations, not facts** ([ADR 0008](../../docs/adr/0008-provenance-observations-first.md)).
   Every table says which source published it, when we fetched it, and how much we trust
   it. Two sources covering the same fixture produce two rows, and the UI says so rather
   than hiding it behind a `DISTINCT`.

## Running it

`apps/api` does not exist yet (issue #18), so `mocks/` serves the contract from the
committed source samples in `docs/samples/ligafutve/`:

```bash
pnpm --filter @openfutve/web mock:api   # stands in for apps/api on API_PORT (3000)
pnpm --filter @openfutve/web dev        # http://localhost:5173
```

Point the app at a real API with `OPENFUTVE_API_URL`. Nothing in `app/` knows the mock
exists; delete `mocks/` when #18 lands.

```bash
pnpm --filter @openfutve/web test        # client + formatting unit tests
pnpm --filter @openfutve/web typecheck
pnpm --filter @openfutve/web build
```

## Layout

```
app/
├── lib/api/         # the wire contract (types.ts) and the typed client
├── lib/api.server.ts# the client loaders use, plus the degraded-state helper
├── lib/format.ts    # dates in the venue's clock, not the reader's
├── components/      # chrome, tables, provenance badges, empty/error states
└── routes/          # one module per page: loader + meta + component
mocks/               # temporary stand-in for apps/api — see above
```

### Degraded states are not a polish pass

ADR 0006 says the API must be up for a page to render server-side, so `loadOrDegrade`
turns an API failure into a rendered state rather than a 500. Three cases, three different
messages: the API is unreachable, the API returned 404 (we have not ingested that season),
or the API errored. Conflating them sends the reader to the wrong conclusion.

### Language

The UI is in Spanish; code, comments, docs and the API contract stay in English. There is
no i18n framework and no ADR for this yet — see the open issue on recording that decision.
