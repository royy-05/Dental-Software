import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from "./totp";
import { checkPasswordStrength } from "./password";

describe("TOTP (RFC 6238 / 4226)", () => {
  const rfcSecret = Buffer.from("12345678901234567890");
  it("matches the RFC 4226 HOTP test vectors", () => {
    expect([0, 1, 2, 3, 9].map((c) => hotp(rfcSecret, c))).toEqual(["755224", "287082", "359152", "969429", "520489"]);
  });
  it("matches the RFC 6238 SHA-1 vector at T=59s", () => {
    expect(totp(base32Encode(rfcSecret), 59_000)).toBe("287082");
  });
  it("round-trips base32", () => {
    expect(base32Decode(base32Encode(rfcSecret)).equals(rfcSecret)).toBe(true);
  });
  it("accepts one step of drift and rejects older codes", () => {
    const s = base32Encode(rfcSecret);
    const now = 1_700_000_000_000;
    expect(verifyTotp(s, totp(s, now - 30_000), now)).toBe(true);
    expect(verifyTotp(s, totp(s, now - 90_000), now)).toBe(false);
    expect(verifyTotp(s, "abc", now)).toBe(false);
  });
});

describe("password rules", () => {
  it("enforces length, character classes, common passwords and email name", () => {
    expect(checkPasswordStrength("short1!A")).toMatch(/12 characters/);
    expect(checkPasswordStrength("alllowercaseletters")).toMatch(/3 of/);
    expect(checkPasswordStrength("Password1234")).toBeNull();
    expect(checkPasswordStrength("P@ssw0rd1234")).toMatch(/common/);
    expect(checkPasswordStrength("Olivia-Secret-99", "olivia@x.example.com")).toMatch(/email/);
    expect(checkPasswordStrength("Correct-Horse-42")).toBeNull();
  });
});
