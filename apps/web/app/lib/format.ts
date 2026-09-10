/**
 * Display helpers.
 *
 * Dates render in `es-VE` with an explicit `America/Caracas` time zone: a
 * kickoff time is a fact about a place, and rendering it in the reader's zone
 * would make the same fixture read differently to a reader in Madrid than to
 * one in Maracaibo. The venue's clock is the one that matters.
 */

const VENUE_TIME_ZONE = "America/Caracas";

/**
 * `match_date` is a plain calendar date, not an instant, so it is formatted in
 * UTC to match how it is parsed below. Formatting it in the venue zone would
 * shift midnight UTC back four hours and print the previous day.
 */
const dayFormatter = new Intl.DateTimeFormat("es-VE", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("es-VE", {
  timeZone: VENUE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const instantFormatter = new Intl.DateTimeFormat("es-VE", {
  timeZone: VENUE_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

/** `YYYY-MM-DD` from the API — already the venue's local date. */
export function formatMatchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return dayFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatKickoff(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : timeFormatter.format(at);
}

export function formatInstant(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : instantFormatter.format(at);
}

/** `+12`, `-3`, `0` — the sign carries meaning in a standings column. */
export function formatGoalDifference(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
