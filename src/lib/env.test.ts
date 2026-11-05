import { describe, expect, it } from "vitest";
import { validateEnv } from "./env";

describe("env validation", () => {
  const validBase = {
    NODE_ENV: "development",
    POSTGRES_PORT: "5432",
    DATABASE_URL: "postgresql://kivi_app:secret@localhost:5432/kivi",
    DIRECT_DATABASE_URL: "postgresql://kivi:secret@localhost:5432/kivi",
    AUTH_SECRET: "12345678901234567890123456789012",
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    LINK_SIGNING_SECRET: "12345678901234567890123456789012",
    APP_BASE_URL: "http://localhost:3000",
    EMAIL_DRIVER: "console",
    EMAIL_FROM: "Kivi Health <bookings@example.com>",
    SMS_DRIVER: "mock",
    DEMO_MODE: "true",
  };

  it("validates a compliant environment", () => {
    const res = validateEnv(validBase);
    expect(res.NODE_ENV).toBe("development");
    expect(res.POSTGRES_PORT).toBe("5432");
    expect(res.DATABASE_URL).toContain("kivi_app");
  });

  it("fails if DATABASE_URL is missing", () => {
    const invalid = { ...validBase, DATABASE_URL: undefined };
    expect(() => validateEnv(invalid)).toThrow(/DATABASE_URL/);
  });

  it("fails if AUTH_SECRET is too short", () => {
    const invalid = { ...validBase, AUTH_SECRET: "short" };
    expect(() => validateEnv(invalid)).toThrow(/AUTH_SECRET/);
  });

  it("fails if APP_ENCRYPTION_KEY is not 32 bytes base64", () => {
    const invalid = { ...validBase, APP_ENCRYPTION_KEY: "not-base64-or-not-32-bytes" };
    expect(() => validateEnv(invalid)).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("fails if LINK_SIGNING_SECRET is missing", () => {
    const invalid = { ...validBase, LINK_SIGNING_SECRET: undefined };
    expect(() => validateEnv(invalid)).toThrow(/LINK_SIGNING_SECRET/);
  });

  it("strictly forbids DEMO_MODE=true in production", () => {
    const prodWithDemo = {
      ...validBase,
      NODE_ENV: "production",
      DEMO_MODE: "true",
    };
    expect(() => validateEnv(prodWithDemo)).toThrow(/SECURITY VIOLATION.*DEMO_MODE/);
  });

  it("allows production when DEMO_MODE is false or undefined", () => {
    const prodOk = {
      ...validBase,
      NODE_ENV: "production",
      DEMO_MODE: "false",
    };
    const res = validateEnv(prodOk);
    expect(res.NODE_ENV).toBe("production");
    expect(res.DEMO_MODE).toBe("false");
  });

  it("requires RESEND_API_KEY when EMAIL_DRIVER is resend", () => {
    const resendWithoutKey = {
      ...validBase,
      EMAIL_DRIVER: "resend",
      RESEND_API_KEY: "",
    };
    expect(() => validateEnv(resendWithoutKey)).toThrow(/RESEND_API_KEY/);
  });
});
