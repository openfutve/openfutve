import { Link, useSearchParams } from "react-router";

import type { Route } from "./+types/teams";
import { apiClient, loadOrDegrade } from "~/lib/api.server.ts";
import { DEFAULT_SEASON, PAGE_SIZE } from "~/lib/config.ts";
import { ConfidenceDot, ObservationNotice, SourceBadge } from "~/components/provenance.tsx";
import { Degraded, EmptyState } from "~/components/states.tsx";
import { PageHeader, Panel, TableScroll } from "~/components/ui.tsx";

export function meta() {
  return [
    { title: "Equipos · openFutVE" },
    {
      name: "description",
      content:
        "Clubes de la Liga FUTVE Primera División, con la fuente que los reportó y su identificador de origen.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const season = url.searchParams.get("temporada")?.trim() || DEFAULT_SEASON;
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;

  // `division: primera` is the scope guard from ADR 0009 expressed as a query:
  // membership is a fact about a (club, season) pair, so it needs the season.
  const teams = await loadOrDegrade(() =>
    apiClient().listTeams({ season, division: "primera", cursor, limit: PAGE_SIZE }),
  );

  return { season, teams };
}

export default function Teams({ loaderData }: Route.ComponentProps) {
  const { season, teams } = loaderData;
  const [searchParams] = useSearchParams();

  return (
    <main className="space-y-6">
      <PageHeader
        title="Equipos"
        lede={`Clubes que una fuente sitúa en Primera División en la temporada ${season}. Un club ascendido o descendido aparece o desaparece según la temporada — no es un dato del club, es un dato del par (club, temporada).`}
      />

      {teams.ok ? (
        <>
          <ObservationNotice source={teams.value.meta.source} />
          <Panel>
            {teams.value.data.length > 0 ? (
              <>
                <TableScroll>
                  <table className="w-full min-w-[30rem] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                        <th scope="col" className="px-4 py-2 font-medium">Club</th>
                        <th scope="col" className="px-4 py-2 font-medium">Ciudad</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Fundado</th>
                        <th scope="col" className="px-4 py-2 font-medium">Fuente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.value.data.map((team) => (
                        <tr
                          key={team.id}
                          className="border-b border-line/60 last:border-0 hover:bg-raised/50"
                        >
                          <th scope="row" className="px-4 py-2 text-left font-medium">
                            {team.canonical_name}
                            {team.short_name ? (
                              <span className="ml-2 text-xs text-faint">{team.short_name}</span>
                            ) : null}
                          </th>
                          <td className="px-4 py-2 text-muted">{team.city ?? "—"}</td>
                          <td className="tabular px-4 py-2 text-right text-muted">
                            {team.founded_year ?? "—"}
                          </td>
                          <td className="px-4 py-2">
                            <span className="flex items-center gap-2">
                              <ConfidenceDot confidence={team.provenance.confidence} />
                              <SourceBadge source={team.provenance.source} />
                              <span className="font-mono text-xs text-faint">{team.source_ref}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
                <div className="border-t border-line px-4 py-3 text-right">
                  {teams.value.page.next_cursor ? (
                    <Link
                      to={`?${nextPageParams(searchParams, teams.value.page.next_cursor)}`}
                      className="rounded-md border border-line px-3 py-1 text-sm hover:border-vino hover:text-vino-ink"
                    >
                      Más equipos →
                    </Link>
                  ) : (
                    <span className="text-xs text-faint">
                      {teams.value.data.length} clubes en {season}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <EmptyState
                title="Sin equipos"
                body={`Ninguna fuente reporta clubes de Primera para la temporada ${season}.`}
              />
            )}
          </Panel>
        </>
      ) : (
        <Degraded reason={teams.reason} detail={teams.detail} />
      )}
    </main>
  );
}

function nextPageParams(current: URLSearchParams, cursor: string): string {
  const next = new URLSearchParams(current);
  next.set("cursor", cursor);
  return next.toString();
}
