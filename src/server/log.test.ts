import { describe, expect, it, vi } from "vitest";
import { log } from "./log";

describe("logger redaction", () => {
  it("redacts patient PHI and credentials from log output", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    log.error("Test error", {
      name: "John Doe",
      email: "patient@example.com",
      phone: "555-1234",
      dob: "1990-01-01",
      message: "My back hurts",
      password: "secretPassword",
      token: "secretToken",
      secret: "apiSecret",
      ssn: "123-45-6789",
      clinicId: "c_brightsmile",
      validMeta: "ok",
    });

    expect(errorSpy).toHaveBeenCalled();
    const loggedJson = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(loggedJson.name).toBe("[redacted]");
    expect(loggedJson.email).toBe("[redacted]");
    expect(loggedJson.phone).toBe("[redacted]");
    expect(loggedJson.dob).toBe("[redacted]");
    expect(loggedJson.message).toBe("[redacted]");
    expect(loggedJson.password).toBe("[redacted]");
    expect(loggedJson.token).toBe("[redacted]");
    expect(loggedJson.secret).toBe("[redacted]");
    expect(loggedJson.ssn).toBe("[redacted]");
    expect(loggedJson.clinicId).toBe("c_brightsmile");
    expect(loggedJson.validMeta).toBe("ok");

    errorSpy.mockRestore();
  });
});
