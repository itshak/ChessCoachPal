import { describe, expect, it } from "vitest";
import { workplaceLocalToUtc, utcToWorkplaceLocal } from "./coaching-time";
import { instructorMinutes } from "./server/coach-service";

describe("workplace wall-clock times", () => {
  it("resolves an Israeli summer session without using browser or server timezone", () => {
    expect(workplaceLocalToUtc("2027-04-01T17:00", "Asia/Jerusalem")).toBe("2027-04-01T14:00:00.000Z");
    expect(utcToWorkplaceLocal("2027-04-01T14:00:00.000Z", "Asia/Jerusalem")).toBe("2027-04-01T17:00");
  });
  it("rejects a DST gap and DST fold rather than silently moving the meeting", () => {
    expect(() => workplaceLocalToUtc("2027-03-14T02:30", "America/New_York")).toThrow(/does not exist/);
    expect(() => workplaceLocalToUtc("2027-11-07T01:30", "America/New_York")).toThrow(/occurs twice/);
  });
  it("rejects invalid dates and unrecognized IANA zones", () => {
    expect(() => workplaceLocalToUtc("2027-02-30T15:00", "UTC")).toThrow(/Invalid calendar/);
    expect(() => workplaceLocalToUtc("2027-04-01T15:00", "Somewhere/Invalid")).toThrow(/Invalid workplace/);
  });
});

describe("instructor time", () => {
  it("counts group and private sessions once, independent of roster size", () => {
    const oneGroup = [{ duration_minutes: 60, status: "completed" }];
    expect(instructorMinutes(oneGroup)).toBe(60);
    expect(instructorMinutes([...oneGroup, { duration_minutes: 30, status: "cancelled" }])).toBe(60);
    expect(instructorMinutes([...oneGroup, { duration_minutes: 45, status: "scheduled" }])).toBe(105);
  });
});
