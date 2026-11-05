import { prisma } from "./db";
import { tooMany } from "./errors";

/**
 * Fixed-window rate limiter stored in Postgres (works across app instances).
 * Returns the count in the current window; throws 429 when `limit` is exceeded.
 */
export async function hit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; count: number; retryAfter: number }> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`;
  const count = Number(rows[0]?.count ?? 1);
  const retryAfter = Math.ceil((windowStart.getTime() + windowMs - now) / 1000);
  return { ok: count <= limit, count, retryAfter };
}

export async function enforce(key: string, limit: number, windowSec: number): Promise<void> {
  const r = await hit(key, limit, windowSec);
  if (!r.ok) throw tooMany(r.retryAfter);
}

/** Named limits used across the app. */
export const LIMITS = {
  loginPerEmail: { limit: 5, windowSec: 15 * 60 },
  loginPerIp: { limit: 30, windowSec: 15 * 60 },
  passwordResetPerIp: { limit: 5, windowSec: 60 * 60 },
  publicBookingPerIp: { limit: 10, windowSec: 60 * 60 },
  publicHoldPerIp: { limit: 60, windowSec: 10 * 60 },
  publicReadPerIp: { limit: 600, windowSec: 10 * 60 },
  manageLinkPerIp: { limit: 60, windowSec: 10 * 60 },
  apiPerUser: { limit: 1200, windowSec: 60 },
} as const;
