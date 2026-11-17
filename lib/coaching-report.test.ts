import { describe, expect, it } from "vitest";
import { reportCsv, reportText, reportPresentation, summarizeTeaching, validateReportRange } from "./coaching-report";

describe("deterministic coaching summaries", () => {
  const sessions = [
    { id: "group", starts_at: "2027-04-01T16:00:00Z", duration_minutes: 60, status: "completed" },
    { id: "private", starts_at: "2027-04-02T14:00:00Z", duration_minutes: 45, status: "cancelled" },
    { id: "outside", starts_at: "2027-04-03T14:00:00Z", duration_minutes: 30, status: "completed" },
  ];
  it("counts a four-person group once and attendance per learner", () => {
    const result = summarizeTeaching(sessions, [
      { session_id: "group", status: "present" },
      { session_id: "group", status: "present" },
      { session_id: "group", status: "absent" },
      { session_id: "group", status: "late" },
      { session_id: "private", status: "present" },
    ], "2027-04-01", "2027-04-02", "Asia/Jerusalem", "he");
    expect(result.teachingMinutes).toBe(60);
    expect(result.sessions).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.participants).toBe(4);
    expect(result.attendance).toEqual({ present: 2, absent: 1, late: 1, excused: 0, unmarked: 0 });
    expect(reportCsv(result)).toContain('"דקות הוראה","60"');
    expect(reportCsv(result)).toMatch(/^\uFEFF/);
    expect(reportText(result)).toContain("דקות הוראה: 60");
    expect(reportCsv(result,"ru")).toContain('"Минут занятий","60"');
    expect(reportText(result,"ru")).toContain("Минут занятий: 60");
    expect(reportCsv(result,"en")).toContain('"Teaching minutes","60"');
  });
  it("separates original workplace locale and machine fields from requested output language", () => {
    const r=summarizeTeaching([sessions[0]],[
      {session_id:"group",status:"present"},
      {session_id:"group",status:"absent"}
    ],"2027-04-01","2027-04-02","Asia/Jerusalem","he");
    const before=JSON.stringify(r);
    const hebrew=reportPresentation(r);
    const russian=reportPresentation(r,"ru");
    const english=reportPresentation(r,"en");
    expect(hebrew).toMatchObject({outputLocale:"he",direction:"rtl",timezone:"Asia/Jerusalem"});
    expect(hebrew.metrics.find(x=>x.key==="teachingMinutes")?.label).toBe("דקות הוראה");
    expect(russian).toMatchObject({outputLocale:"ru",direction:"ltr"});
    expect(russian.metrics.find(x=>x.key==="teachingMinutes")?.label).toBe("Минут занятий");
    expect(english.metrics.find(x=>x.key==="teachingMinutes")?.label).toBe("Teaching minutes");
    expect(russian.attendance.find(x=>x.status==="absent")?.value).toBe("1");
    expect(english.period).toMatch(/Apr/);
    expect(russian.period).not.toBe(english.period);
    expect(r.locale).toBe("he");
    expect(JSON.stringify(r)).toBe(before);
    expect(reportCsv(r,"ru")).toMatch(/^\uFEFF/);
    expect(reportCsv(r,"ru")).not.toContain("group");
    expect(reportText(r,"en")).toContain("Teaching minutes: 60");
  });
  it("uses the workplace's local day, not the server's UTC day", () => {
    const rows = [{ id: "late", starts_at: "2027-03-31T22:30:00Z", duration_minutes: 30, status: "scheduled" }];
    expect(summarizeTeaching(rows, [], "2027-04-01", "2027-04-01", "Asia/Jerusalem", "he").teachingMinutes).toBe(30);
    expect(summarizeTeaching(rows, [], "2027-04-01", "2027-04-01", "UTC", "en").teachingMinutes).toBe(0);
  });
  it("rejects invalid or oversized ranges", () => {
    expect(() => validateReportRange("2027-02-29", "2027-03-01")).toThrow();
    expect(() => validateReportRange("2027-04-02", "2027-04-01")).toThrow();
    expect(() => validateReportRange("2020-01-01", "2027-01-01")).toThrow();
  });
});
