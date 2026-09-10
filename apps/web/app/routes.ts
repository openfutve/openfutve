import { type RouteConfig, index, route } from "@react-router/dev/routes";

/**
 * Paths are Spanish because the readers are: `/tabla`, not `/standings`. The
 * API keeps its English, schema-shaped paths — the two audiences are different.
 */
export default [
  index("routes/home.tsx"),
  route("tabla", "routes/standings.tsx"),
  route("partidos", "routes/matches.tsx"),
  route("equipos", "routes/teams.tsx"),
] satisfies RouteConfig;
