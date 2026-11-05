import { hmac, safeEqual } from "./auth/crypto";
import { linkSecret } from "./env";

/**
 * Signed, expiring patient links (section 3, "reschedule and cancel links in every message").
 *
 * Token = base64url(`${appointmentId}.${version}.${expiresAtSec}`) + "." + base64url(HMAC-SHA256(secret, payload)).
 * - `version` is the appointment's version column, bumped on every reschedule and cancel, so links in older
 *   messages stop working as soon as a newer message has been sent.
 * - `expiresAt` is the appointment start plus a grace period, so a link cannot be used long after the visit.
 * Tokens carry no PHI and are useless without the signing secret.
 */
export interface LinkPayload {
  appointmentId: string;
  version: number;
  expiresAt: number; // epoch seconds
}

const enc = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signManageToken(p: LinkPayload): string {
  const payload = enc(`${p.appointmentId}.${p.version}.${p.expiresAt}`);
  return `${payload}.${enc(hmac(linkSecret(), payload))}`;
}

export type VerifyResult = { ok: true; payload: LinkPayload } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyManageToken(token: string, now = Date.now()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || token.length > 400) return { ok: false, reason: "malformed" };
  const [payload, sig] = parts;
  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!safeEqual(hmac(linkSecret(), payload), sigBuf)) return { ok: false, reason: "bad_signature" };
  const raw = Buffer.from(payload, "base64url").toString("utf8").split(".");
  if (raw.length !== 3) return { ok: false, reason: "malformed" };
  const [appointmentId, version, expiresAt] = raw;
  const v = Number(version);
  const exp = Number(expiresAt);
  if (!appointmentId || !Number.isInteger(v) || !Number.isFinite(exp)) return { ok: false, reason: "malformed" };
  if (exp * 1000 < now) return { ok: false, reason: "expired" };
  return { ok: true, payload: { appointmentId, version: v, expiresAt: exp } };
}

/** Links stay valid until 7 days after the appointment start (so a missed visit can still be rebooked from the email). */
export const LINK_GRACE_SEC = 7 * 24 * 3600;

export function manageTokenFor(appt: { id: string; version: number; startUtc: Date }): string {
  return signManageToken({ appointmentId: appt.id, version: appt.version, expiresAt: Math.floor(appt.startUtc.getTime() / 1000) + LINK_GRACE_SEC });
}

export function manageUrl(baseUrl: string, slug: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/book/${slug}/manage/${token}`;
}
