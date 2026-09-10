import type { DegradedReason } from "~/lib/api.server.ts";

/**
 * What a page shows when it has no data.
 *
 * ADR 0006: "loaders need real error and degraded states from day 1, not as a
 * polish pass". A section that cannot load keeps the rest of the page usable
 * and says which of the two things happened — the API is down, or the API is
 * fine and we simply have not ingested this yet. Conflating them sends the
 * reader to the wrong place.
 */

const MESSAGES: Record<DegradedReason, { title: string; body: string }> = {
  unreachable: {
    title: "No pudimos contactar la API",
    body: "El servicio de datos no respondió. La página se muestra sin esta sección; vuelve a intentarlo en un momento.",
  },
  "not-found": {
    title: "Todavía no tenemos estos datos",
    body: "La API respondió, pero no hay registros para esta consulta. Puede que la temporada aún no se haya ingerido.",
  },
  error: {
    title: "La API respondió con un error",
    body: "Algo falló de nuestro lado. El error quedó registrado; no hay nada que puedas hacer desde aquí.",
  },
};

export function Degraded({ reason, detail }: { reason: DegradedReason; detail?: string }) {
  const { title, body } = MESSAGES[reason];
  const tone = reason === "not-found" ? "border-line bg-raised" : "border-negative/40 bg-vino-soft";

  return (
    <div className={`rounded-lg border ${tone} px-4 py-5`} role="status">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-prose text-sm text-muted">{body}</p>
      {detail ? <p className="mt-2 font-mono text-xs text-faint">{detail}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-prose text-sm text-muted">{body}</p>
    </div>
  );
}
