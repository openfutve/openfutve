import { Link } from "react-router";

import type { Route } from "./+types/home";
import { apiClient, loadOrDegrade } from "~/lib/api.server.ts";
import { DEFAULT_SEASON } from "~/lib/config.ts";
import { MatchList } from "~/components/match-list.tsx";
import { ProvenanceLine } from "~/components/provenance.tsx";
import { Degraded } from "~/components/states.tsx";
import { StandingsTable } from "~/components/standings-table.tsx";
import { Panel, PanelHeader } from "~/components/ui.tsx";

export function meta() {
  return [
    { title: "openFutVE · Datos abiertos de la Liga FUTVE" },
    {
      name: "description",
      content:
        "Tabla, partidos y equipos de la Liga FUTVE Primera División, con la fuente y el nivel de confianza de cada dato.",
    },
  ];
}

export async function loader() {
  const api = apiClient();

  // Independent reads, so they go out together: the page is only as slow as the
  // slower one, and either can degrade without taking the other down.
  const [standings, matches] = await Promise.all([
    loadOrDegrade(() => api.getStandings({ season: DEFAULT_SEASON })),
    loadOrDegrade(() => api.listMatches({ limit: 8 })),
  ]);

  return { season: DEFAULT_SEASON, standings, matches };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { season, standings, matches } = loaderData;

  return (
    <main className="space-y-10">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          El fútbol venezolano, en datos que puedes verificar
        </h1>
        <p className="mt-3 text-muted leading-relaxed">
          Cada cifra de este sitio viene con su origen: qué fuente la publicó, cuándo la
          recogimos y cuánto confiamos en ella. No reconciliamos fuentes todavía — mostramos lo
          que cada una dijo.
        </p>
      </section>

      <Panel>
        <PanelHeader
          title={`Tabla ${season}`}
          action={
            <Link to="/tabla" className="text-sm text-vino-ink hover:underline">
              Tabla completa →
            </Link>
          }
        />
        {standings.ok ? (
          <>
            <StandingsTable rows={standings.value.data.rows} limit={5} />
            <div className="border-t border-line px-4 py-3">
              <ProvenanceLine
                provenance={standings.value.data.provenance}
                observedAt={standings.value.data.observed_at}
              />
            </div>
          </>
        ) : (
          <div className="p-4">
            <Degraded reason={standings.reason} />
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Últimos partidos"
          action={
            <Link to="/partidos" className="text-sm text-vino-ink hover:underline">
              Todos los partidos →
            </Link>
          }
        />
        {matches.ok ? (
          <>
            <MatchList matches={matches.value.data} />
            {matches.value.data[0] ? (
              <div className="border-t border-line px-4 py-3">
                <ProvenanceLine provenance={matches.value.data[0].provenance} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="p-4">
            <Degraded reason={matches.reason} />
          </div>
        )}
      </Panel>
    </main>
  );
}
