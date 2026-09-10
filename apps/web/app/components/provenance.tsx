import type { Confidence, Provenance } from "~/lib/api/index.ts";
import { formatInstant } from "~/lib/format.ts";

/**
 * Provenance, made visible.
 *
 * Phase 1 serves observations, not resolved truth (ADR 0008), so a page that
 * showed a table with no attribution would be claiming more than the data
 * supports. Every view that renders numbers renders one of these next to them.
 */

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Alta confianza",
  medium: "Confianza media",
  low: "Confianza baja",
  disputed: "Fuentes en desacuerdo",
};

const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: "bg-positive",
  medium: "bg-warn",
  low: "bg-faint",
  disputed: "bg-negative",
};

export function ConfidenceDot({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${CONFIDENCE_TONE[confidence]}`}
      title={CONFIDENCE_LABEL[confidence]}
      aria-label={CONFIDENCE_LABEL[confidence]}
      role="img"
    />
  );
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[0.7rem] tracking-tight text-muted">
      {source}
    </span>
  );
}

/** One line: who said it, when they said it, how much we trust it. */
export function ProvenanceLine({
  provenance,
  observedAt,
  className = "",
}: {
  provenance: Provenance;
  /** When the source published this view of the data, if it differs from the fetch. */
  observedAt?: string;
  className?: string;
}) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted ${className}`}>
      <ConfidenceDot confidence={provenance.confidence} />
      <span>
        Según <SourceBadge source={provenance.source} />
      </span>
      {observedAt ? <span>· publicado {formatInstant(observedAt)}</span> : null}
      <span>· recogido {formatInstant(provenance.fetched_at)}</span>
    </p>
  );
}

/**
 * The standing caveat for Phase 1 reads. Shown once per page rather than per
 * row: the point is that the reader understands what they are looking at, not
 * that we repeat ourselves.
 */
export function ObservationNotice({ source }: { source: string }) {
  return (
    <p className="rounded-md border border-line bg-raised/60 px-3 py-2 text-xs leading-relaxed text-muted">
      Estos datos son <strong className="font-semibold text-ink">observaciones</strong> de una sola
      fuente (<SourceBadge source={source} />), no hechos reconciliados. Otras fuentes pueden
      contradecirlas; la resolución entre fuentes llega en la Fase 2.
    </p>
  );
}
