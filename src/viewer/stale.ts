// An ISO 8601 date and time with an explicit offset. A date alone, or a time
// without an offset, names a different instant in every timezone, so, as in
// the reference viewer, it never makes a concept stale (SPEC §4.2).
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Whether a concept is stale at `now`, in milliseconds since the epoch (OKF §5.5). */
export function isStale(staleAfter: string, now: number): boolean {
  if (!INSTANT.test(staleAfter)) return false;
  const instant = Date.parse(staleAfter);
  return !Number.isNaN(instant) && now >= instant;
}
