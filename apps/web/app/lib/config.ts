/**
 * Defaults the UI falls back to when the reader has not chosen.
 *
 * `DEFAULT_SEASON` is a constant rather than "the newest season in the data"
 * because there is no seasons endpoint yet (issue #18). When there is one, this
 * becomes a lookup and the constant goes away.
 */
export const DEFAULT_SEASON = "2025";

/** Page size for list endpoints. Small enough that SSR stays cheap. */
export const PAGE_SIZE = 25;
