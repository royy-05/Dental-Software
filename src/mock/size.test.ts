import { expect, it } from "vitest";
import { buildSeed } from "./index";

it("fits comfortably in localStorage", () => {
  const db = buildSeed(new Date("2026-11-04T15:00:00Z"));
  const bytes = JSON.stringify(db).length;
  console.log("seed bytes", bytes, "appointments", db.appointments.length, "sessions", db.widgetSessions.length, "messages", db.messages.length);
  expect(bytes).toBeLessThan(3_500_000);
});
