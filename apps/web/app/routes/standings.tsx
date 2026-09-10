import { Form } from "react-router";

import type { Route } from "./+types/standings";
import { apiClient, loadOrDegrade } from "~/lib/api.server.ts";
import { DEFAULT_SEASON } from "~/lib/config.ts";
import { StandingsTable } from "~/components/standings-table.tsx";
import { ObservationNotice, ProvenanceLine } from "~/components/provenance.tsx";
import { Degraded, EmptyState } from "~/components/states.tsx";
import { PageHeader, Panel } from "~/components/ui.tsx";

export function meta({ loaderData }: Route.MetaArgs) {
  const season = loaderData?.season ?? DEFAULT_SEASON;
  return [
    { title: `Tabla ${season} · openFutVE` },
    {
      name: "description",
      content: `Clasificación de la Liga FUTVE Primera División, temporada ${season}, con la fuente y la fecha de cada observación.`,
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const season = new URL(request.url).searchParams.get("temporada")?.trim() || DEFAULT_SEASON;
  const standings = await loadOrDegrade(() => apiClient().getStandings({ season }));
  return { season, standings };
}

export default function Standings({ loaderData }: Route.ComponentProps) {
  const { season, standings } = loaderData;

  return (
    <main className="space-y-6">
      <PageHeader
        title="Tabla de posiciones"
        lede="Instantáneas publicadas por la fuente, no una tabla calculada por nosotros. Cuando la fuente corrige la tabla, guardamos ambas versiones."
        aside={<SeasonPicker season={season} />}
      />

      {standings.ok ? (
        <>
          <ObservationNotice source={standings.value.data.provenance.source} />
          <Panel>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight">
                Temporada {standings.value.data.season}
                {standings.value.data.stage ? (
                  <span className="ml-2 font-normal text-muted">{standings.value.data.stage}</span>
                ) : null}
              </h2>
              <ProvenanceLine
                provenance={standings.value.data.provenance}
                observedAt={standings.value.data.observed_at}
              />
            </div>
            {standings.value.data.rows.length > 0 ? (
              <StandingsTable rows={standings.value.data.rows} />
            ) : (
              <EmptyState
                title="Tabla vacía"
                body="La fuente publicó esta temporada sin filas. No es un error de la página."
              />
            )}
          </Panel>
        </>
      ) : (
        <Degraded reason={standings.reason} detail={standings.detail} />
      )}
    </main>
  );
}

/**
 * A plain GET form, so the season lives in the URL and the page is shareable
 * and server-rendered. There is no seasons endpoint yet (issue #18), so this is
 * a free-text field rather than a select — inventing a hardcoded season list
 * would go stale the moment a season is ingested.
 */
function SeasonPicker({ season }: { season: string }) {
  return (
    <Form method="get" className="flex items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-faint">Temporada</span>
        <input
          type="text"
          name="temporada"
          defaultValue={season}
          placeholder="2025 o 2025-C"
          className="w-32 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-vino focus:outline-none"
        />
      </label>
      <button
        type="submit"
        className="rounded-md border border-line bg-raised px-3 py-1 text-sm hover:border-vino hover:text-vino-ink"
      >
        Ver
      </button>
    </Form>
  );
}
