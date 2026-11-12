import { describe, expect, it } from "vitest";
import { planCanonicalOccurrences, type CanonicalSlot } from "./canonical-calendar-service";

const teacher = "00000000-0000-0000-0000-000000000001";
const workplace = "00000000-0000-0000-0000-000000000002";
const otherWorkplace = "00000000-0000-0000-0000-000000000003";
const student = "00000000-0000-0000-0000-000000000004";
const slot: CanonicalSlot = {
  id: "00000000-0000-0000-0000-000000000005",
  teacher_id: teacher, student_id: student, workplace_id: workplace,
  day_of_week: 1, start_time: "16:00", duration_minutes: 60,
  start_date: "2027-03-01", end_date: null, active: true,
  is_home_visit: true,
};
const workplaces = [
  { id: workplace, timezone: "America/New_York" },
  { id: otherWorkplace, timezone: "Europe/London" },
];
const plan = (slots: CanonicalSlot[] = [slot], from = "2027-03-01", to = "2027-03-15") =>
  planCanonicalOccurrences(teacher, slots, workplaces, workplace,
    "America/New_York", from, to);

describe("canonical recurring teaching sessions", () => {
  it("stores stable local slot occurrence identity across DST changes", () => {
    const rows = plan();
    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.slot_occurrence_date))
      .toEqual(["2027-03-01", "2027-03-08", "2027-03-15"]);
    expect(rows.map(row => row.starts_at))
      .toEqual([
        "2027-03-01T21:00:00.000Z",
        "2027-03-08T20:00:00.000Z",
        "2027-03-15T20:00:00.000Z",
      ]);
    expect(rows.every(row => row.slot_id === slot.id
      && row.workplace_id === workplace && row.student_id === student
      && row.local_timezone === "America/New_York" && row.is_home_visit))
      .toBe(true);
  });
  it("resolves workplace timezone per slot, never from another tenant", () => {
    const second = { ...slot, id: "00000000-0000-0000-0000-000000000006",
      workplace_id: otherWorkplace };
    const rows = plan([slot, second], "2027-03-08", "2027-03-08");
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.starts_at))
      .toEqual(["2027-03-08T20:00:00.000Z", "2027-03-08T16:00:00.000Z"]);
    expect(() => plan([{ ...slot, teacher_id: otherWorkplace }]))
      .toThrow("Cross-tenant");
    expect(() => plan([{ ...slot, workplace_id: student }]))
      .toThrow("Unrecognized teacher workplace");
  });
  it("never invents sessions for inactive slots or silently tolerates duplicates", () => {
    expect(plan([{ ...slot, active: false }])).toEqual([]);
    expect(() => plan([slot, slot])).toThrow("Duplicate slot/date");
    expect(() => plan([{ ...slot, duration_minutes: 10 }])).toThrow("15–480");
  });
  it("rejects malformed or excessively broad ranges", () => {
    expect(() => plan([slot], "2027-03-30", "2027-03-01")).toThrow("date range");
    expect(() => plan([slot], "2027-03-01", "2028-04-01")).toThrow("at most one year");
  });
});
