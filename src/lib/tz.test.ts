import { describe, expect, it } from "vitest";
import { utcToZonedWall, zonedWallToUtc } from "./tz";

describe("time zone and DST conversions (tz.ts)", () => {
  it("converts standard wall-clock to UTC and back accurately (America/New_York)", () => {
    const tz = "America/New_York";
    const wall = "2026-01-15T14:30"; // EST (UTC-5)
    const utc = zonedWallToUtc(wall, tz);
    expect(utc.toISOString()).toBe("2026-01-15T19:30:00.000Z");

    const backToWall = utcToZonedWall(utc, tz);
    expect(backToWall).toBe(wall);
  });

  it("handles Daylight Saving Time (DST) summer time (EDT UTC-4)", () => {
    const tz = "America/New_York";
    const wall = "2026-07-15T14:30"; // EDT (UTC-4)
    const utc = zonedWallToUtc(wall, tz);
    expect(utc.toISOString()).toBe("2026-07-15T18:30:00.000Z");

    const backToWall = utcToZonedWall(utc, tz);
    expect(backToWall).toBe(wall);
  });

  it("handles DST spring forward boundary (March 8, 2026 in US)", () => {
    const tz = "America/New_York";
    // 2026-03-08 01:59 is EST (UTC-5), 03:00 is EDT (UTC-4)
    const before = "2026-03-08T01:30";
    const after = "2026-03-08T03:30";

    const utcBefore = zonedWallToUtc(before, tz);
    const utcAfter = zonedWallToUtc(after, tz);

    expect(utcBefore.toISOString()).toBe("2026-03-08T06:30:00.000Z");
    expect(utcAfter.toISOString()).toBe("2026-03-08T07:30:00.000Z");

    expect(utcToZonedWall(utcBefore, tz)).toBe(before);
    expect(utcToZonedWall(utcAfter, tz)).toBe(after);
  });

  it("handles DST fall back boundary (November 1, 2026 in US)", () => {
    const tz = "America/New_York";
    // 2026-11-01 01:30 is EDT then repeats as EST
    const postFallBack = "2026-11-01T04:00"; // definitely EST (UTC-5)
    const utc = zonedWallToUtc(postFallBack, tz);
    expect(utc.toISOString()).toBe("2026-11-01T09:00:00.000Z");
    expect(utcToZonedWall(utc, tz)).toBe(postFallBack);
  });

  it("handles non-DST timezones (Asia/Kolkata, UTC+5:30)", () => {
    const tz = "Asia/Kolkata";
    const wall = "2026-05-10T10:00";
    const utc = zonedWallToUtc(wall, tz);
    expect(utc.toISOString()).toBe("2026-05-10T04:30:00.000Z");
    expect(utcToZonedWall(utc, tz)).toBe(wall);
  });
});
