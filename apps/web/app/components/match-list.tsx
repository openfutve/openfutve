import type { MatchObservation, MatchStatus } from "~/lib/api/index.ts";
import { formatKickoff, formatMatchDate } from "~/lib/format.ts";

const STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: "Programado",
  live: "En vivo",
  finished: "Final",
  postponed: "Aplazado",
  cancelled: "Suspendido",
  unknown: "Sin confirmar",
};

/** `finished` is the common case and needs no badge; everything else does. */
function StatusBadge({ status }: { status: MatchStatus }) {
  if (status === "finished") return null;
  const tone =
    status === "live"
      ? "bg-vino text-white"
      : status === "cancelled" || status === "postponed"
        ? "border border-line text-negative"
        : "border border-line text-muted";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[0.7rem] ${tone}`}>{STATUS_LABEL[status]}</span>
  );
}

function Score({ match }: { match: MatchObservation }) {
  if (match.home_score === null || match.away_score === null) {
    return <span className="tabular text-sm text-faint">{formatKickoff(match.kickoff_at) ?? "—"}</span>;
  }
  return (
    <span className="tabular text-sm font-semibold">
      {match.home_score}<span className="px-1 text-faint">–</span>{match.away_score}
    </span>
  );
}

/** Matches grouped by their local calendar date, newest group first. */
export function MatchList({ matches }: { matches: MatchObservation[] }) {
  const days = new Map<string, MatchObservation[]>();
  for (const match of matches) {
    const bucket = days.get(match.match_date);
    if (bucket) bucket.push(match);
    else days.set(match.match_date, [match]);
  }

  return (
    <div>
      {[...days].map(([date, dayMatches]) => (
        <div key={date}>
          <h3 className="border-b border-line bg-raised/40 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-faint">
            {formatMatchDate(date)}
          </h3>
          <ul>
            {dayMatches.map((match) => (
              <li
                key={match.id}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-0 hover:bg-raised/50"
              >
                <span className="text-right text-sm">{match.home_team.canonical_name}</span>
                <span className="flex flex-col items-center gap-1">
                  <Score match={match} />
                  <StatusBadge status={match.status} />
                </span>
                <span className="text-sm">{match.away_team.canonical_name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
