/** Time-zone conversions between clinic wall-clock strings and real instants (DST-aware via Intl). */

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DDTHH:mm" in `timeZone` -> the real instant. */
export function zonedWallToUtc(wall: string, timeZone: string): Date {
  const t = wall.length === 10 ? `${wall}T00:00` : wall.slice(0, 16);
  const guess = new Date(`${t}:00.000Z`);
  const first = new Date(guess.getTime() - offsetMs(guess, timeZone));
  // Re-check with the offset at the computed instant (handles DST boundaries).
  return new Date(guess.getTime() - offsetMs(first, timeZone));
}

/** Real instant -> "YYYY-MM-DDTHH:mm" wall-clock in `timeZone`. */
export function utcToZonedWall(instant: Date, timeZone: string): string {
  return new Date(instant.getTime() + offsetMs(instant, timeZone)).toISOString().slice(0, 16);
}
