import { describe, expect, it } from "vitest";
import { manageTokenFor, signManageToken, verifyManageToken } from "./links";

describe("signed manage links", () => {
  it("round-trips a payload", () => {
    const t = signManageToken({ appointmentId: "a_1", version: 3, expiresAt: Math.floor(Date.now() / 1000) + 60 });
    const r = verifyManageToken(t);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toMatchObject({ appointmentId: "a_1", version: 3 });
  });
  it("rejects tampering, garbage and expiry", () => {
    const t = signManageToken({ appointmentId: "a_1", version: 1, expiresAt: Math.floor(Date.now() / 1000) + 60 });
    expect(verifyManageToken(t.slice(0, -2) + "zz")).toEqual({ ok: false, reason: "bad_signature" });
    const [p, s] = t.split(".");
    expect(verifyManageToken(`${Buffer.from("a_2.1.9999999999").toString("base64url")}.${s}`)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyManageToken("not-a-token")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyManageToken(`${p}`)).toEqual({ ok: false, reason: "malformed" });
    const old = signManageToken({ appointmentId: "a_1", version: 1, expiresAt: Math.floor(Date.now() / 1000) - 1 });
    expect(verifyManageToken(old)).toEqual({ ok: false, reason: "expired" });
  });
  it("binds the token to the appointment version", () => {
    const t = manageTokenFor({ id: "a_9", version: 2, startUtc: new Date(Date.now() + 86400000) });
    const r = verifyManageToken(t);
    expect(r.ok && r.payload.version).toBe(2);
  });
});
