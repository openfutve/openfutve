import type { Config } from "@react-router/dev/config";

export default {
  // SSR, served by the Node server as a container in compose. See ADR 0006 —
  // SPA mode was rejected because analysis posts need SEO.
  ssr: true,

  // Phase 1: analysis post routes get prerendered here at build time.
  // Prerendering must read from fixtures or a running API — never from an
  // `api` build output, since `web#build` deliberately does not depend on
  // `api` in turbo.json (they are coupled at runtime, not at build time).
  // prerender: [...],
} satisfies Config;
