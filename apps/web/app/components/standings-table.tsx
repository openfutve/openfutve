import type { StandingsRow } from "~/lib/api/index.ts";
import { formatGoalDifference } from "~/lib/format.ts";
import { TableScroll } from "./ui.tsx";

/**
 * Column headers use the abbreviations the Venezuelan press uses (PJ, G, E, P,
 * GF, GC, DG, Pts), with the full term in a `title` for anyone who does not
 * know them. Renaming them to English would make the table less readable to
 * exactly the people it is for.
 */
const COLUMNS: { key: keyof StandingsRow | "goal_difference"; label: string; title: string }[] = [
  { key: "played", label: "PJ", title: "Partidos jugados" },
  { key: "won", label: "G", title: "Ganados" },
  { key: "drawn", label: "E", title: "Empatados" },
  { key: "lost", label: "P", title: "Perdidos" },
  { key: "goals_for", label: "GF", title: "Goles a favor" },
  { key: "goals_against", label: "GC", title: "Goles en contra" },
  { key: "goal_difference", label: "DG", title: "Diferencia de goles" },
];

export function StandingsTable({
  rows,
  limit,
}: {
  rows: StandingsRow[];
  /** Show only the first N positions — used for the summary on the home page. */
  limit?: number;
}) {
  const visible = limit ? rows.slice(0, limit) : rows;

  return (
    <TableScroll>
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">Clasificación</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
            <th scope="col" className="w-8 px-3 py-2 text-right font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Club
            </th>
            {COLUMNS.map((column) => (
              <th key={column.label} scope="col" className="px-2 py-2 text-right font-medium">
                <abbr title={column.title} className="no-underline">
                  {column.label}
                </abbr>
              </th>
            ))}
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.team.id} className="border-b border-line/60 last:border-0 hover:bg-raised/50">
              <td className="tabular px-3 py-2 text-right text-muted">{row.position}</td>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                {row.team.canonical_name}
                {row.points_adjustment ? (
                  <span
                    className="ml-2 rounded bg-vino-soft px-1 py-0.5 text-[0.7rem] text-vino-ink"
                    title="Ajuste administrativo de puntos aplicado por la fuente"
                  >
                    {formatGoalDifference(row.points_adjustment)} pts
                  </span>
                ) : null}
              </th>
              {COLUMNS.map((column) => {
                const value =
                  column.key === "goal_difference"
                    ? formatGoalDifference(row.goal_difference)
                    : (row[column.key] as number);
                const tone =
                  column.key === "goal_difference"
                    ? row.goal_difference > 0
                      ? "text-positive"
                      : row.goal_difference < 0
                        ? "text-negative"
                        : "text-muted"
                    : "text-muted";
                return (
                  <td key={column.label} className={`tabular px-2 py-2 text-right ${tone}`}>
                    {value}
                  </td>
                );
              })}
              <td className="tabular px-3 py-2 text-right font-semibold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
