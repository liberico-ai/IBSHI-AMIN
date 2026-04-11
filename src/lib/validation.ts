/**
 * Shared validation helpers for API routes.
 */

/** Returns true if the date is strictly before today (midnight local time) */
export function isInPast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/** Returns true if two date ranges overlap [aStart, aEnd] ∩ [bStart, bEnd] */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}
