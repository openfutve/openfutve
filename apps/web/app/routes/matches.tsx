import { Form, Link, useSearchParams } from "react-router";

import type { Route } from "./+types/matches";
import type { MatchStatus } from "~/lib/api/index.ts";
import { apiClient, loadOrDegrade } from "~/lib/api.server.ts";
import { PAGE_SIZE } from "~/lib/config.ts";
import { MatchList } from "~/components/match-list.tsx";
import { ObservationNotice, ProvenanceLine } from "~/components/provenance.tsx";
import { Degraded, EmptyState } from "~/components/states.tsx";
import { PageHeader, Panel } from "~/components/ui.tsx";

const STATUS_OPTIONS: { value: MatchStatus | ""; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "finished", label: "Jugados" },
  { value: "scheduled", label: "Programados" },
  { value: "postponed", label: "Aplazados" },
];

export function meta({ loaderData }: Route.MetaArgs) {
  const season = loaderData?.filters.season;
  return [
    { title: season ? `Partidos ${season} · openFutVE` : "Partidos · openFutVE" },
    {
      name: "description",
      content:
        "Partidos de la Liga FUTVE Primera División tal como los reportó cada fuente, con fecha de recogida y nivel de confianza.",
    },
  ];
}

/** Reads a search param, treating blank as absent so it never reaches the API. */
function param(url: URL, name: string): string | undefined {
  return url.searchParams.get(name)?.trim() || undefined;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const filters = {
    season: param(url, "temporada"),
    status: param(url, "estado") as MatchStatus | undefined,
    from: param(url, "desde"),
    to: param(url, "hasta"),
  };
  const cursor = param(url, "cursor");

  const matches = await loadOrDegrade(() =>
    apiClient().listMatches({ ...filters, cursor, limit: PAGE_SIZE }),
  );

  return { filters, matches };
}

export default function Matches({ loaderData }: Route.ComponentProps) {
  const { filters, matches } = loaderData;

  return (
    <main className="space-y-6">
      <PageHeader
        title="Partidos"
        lede="Una fila por fuente y por partido. Si dos fuentes cubren el mismo encuentro, verás ambas versiones — eso es deliberado."
      />

      <MatchFilters filters={filters} />

      {matches.ok ? (
        <>
          <ObservationNotice source={matches.value.meta.source} />
          <Panel>
            {matches.value.data.length > 0 ? (
              <>
                <MatchList matches={matches.value.data} />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
                  <ProvenanceLine provenance={matches.value.data[0]!.provenance} />
                  <NextPage cursor={matches.value.page.next_cursor} />
                </div>
              </>
            ) : (
              <EmptyState
                title="Sin partidos"
                body="Ninguna observación coincide con estos filtros. Prueba con otra temporada o quita el filtro de estado."
              />
            )}
          </Panel>
        </>
      ) : (
        <Degraded reason={matches.reason} detail={matches.detail} />
      )}
    </main>
  );
}

function MatchFilters({ filters }: { filters: Route.ComponentProps["loaderData"]["filters"] }) {
  return (
    <Form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface px-4 py-3"
    >
      <Field label="Temporada">
        <input
          type="text"
          name="temporada"
          defaultValue={filters.season ?? ""}
          placeholder="2025-C"
          className={INPUT}
        />
      </Field>
      <Field label="Estado">
        <select name="estado" defaultValue={filters.status ?? ""} className={INPUT}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Desde">
        <input type="date" name="desde" defaultValue={filters.from ?? ""} className={INPUT} />
      </Field>
      <Field label="Hasta">
        <input type="date" name="hasta" defaultValue={filters.to ?? ""} className={INPUT} />
      </Field>
      <button
        type="submit"
        className="rounded-md border border-line bg-raised px-3 py-1.5 text-sm hover:border-vino hover:text-vino-ink"
      >
        Filtrar
      </button>
    </Form>
  );
}

const INPUT =
  "rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-vino focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-faint">{label}</span>
      {children}
    </label>
  );
}

/**
 * Pagination as a link rather than a button: the cursor belongs in the URL, so
 * a page of results can be shared and the back button behaves.
 */
function NextPage({ cursor }: { cursor: string | null }) {
  const [searchParams] = useSearchParams();
  if (!cursor) return <span className="text-xs text-faint">Fin de los resultados</span>;

  // Keep the active filters; only the cursor moves.
  const next = new URLSearchParams(searchParams);
  next.set("cursor", cursor);

  return (
    <Link
      to={`?${next}`}
      className="rounded-md border border-line px-3 py-1 text-sm hover:border-vino hover:text-vino-ink"
    >
      Más partidos →
    </Link>
  );
}
