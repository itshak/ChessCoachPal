/** Deterministic, tenant-filtered teaching report calculations (no model inference). */
export type ReportSession = {
  id: string; starts_at: string; duration_minutes: number;
  status: string;
};
export type ReportAttendance = { session_id: string; status: string };
export type ReportStatus = "present" | "absent" | "late" | "excused" | "unmarked";
export type ReportSummary = {
  from: string; to: string; timezone: string; locale: string;
  sessions: number; cancelled: number; teachingMinutes: number;
  participants: number; attendance: Record<ReportStatus, number>;
};

function dayNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use YYYY-MM-DD dates");
  const stamp = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value)
    throw new Error("Invalid calendar date");
  return stamp;
}

export function validateReportRange(from: string, to: string): void {
  const a = dayNumber(from), b = dayNumber(to);
  if (b < a || b - a > 366 * 86400000)
    throw new Error("Report range must be between 1 and 367 calendar days");
}

export function workplaceDay(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return part("year") + "-" + part("month") + "-" + part("day");
}

export function summarizeTeaching(
  sessions: ReportSession[], rows: ReportAttendance[],
  from: string, to: string, timezone: string, locale: string
): ReportSummary {
  validateReportRange(from, to);
  const attendance: Record<ReportStatus, number> = {
    present: 0, absent: 0, late: 0, excused: 0, unmarked: 0,
  };
  const included = sessions.filter(s =>
    workplaceDay(s.starts_at, timezone) >= from &&
    workplaceDay(s.starts_at, timezone) <= to
  );
  const active = included.filter(s => s.status !== "cancelled");
  const activeIds = new Set(active.map(s => s.id));
  for (const row of rows) {
    if (!activeIds.has(row.session_id)) continue;
    const status: ReportStatus = row.status in attendance ? row.status as ReportStatus : "unmarked";
    attendance[status]++;
  }
  return {
    from, to, timezone, locale, sessions: active.length,
    cancelled: included.length - active.length,
    teachingMinutes: active.reduce((sum, s) => sum + s.duration_minutes, 0),
    participants: Object.values(attendance).reduce((sum, n) => sum + n, 0),
    attendance,
  };
}

/** No student names or private notes are exposed in aggregate exports. */
export function reportCsv(r: ReportSummary): string {
  const lines = [
    ["Metric", "Value"], ["From", r.from], ["To", r.to],
    ["Timezone", r.timezone], ["Sessions", String(r.sessions)],
    ["Cancelled", String(r.cancelled)], ["Teaching minutes", String(r.teachingMinutes)],
    ["Participants", String(r.participants)],
    ...(["present", "absent", "late", "excused", "unmarked"] as const)
      .map(status => ["Attendance " + status, String(r.attendance[status])]),
  ];
  const cell = (value: string) => '"' + ( /^[=+\-@\t\r]/.test(value) ? "'" : "") +
    value.replace(/"/g, '""') + '"';
  return "\uFEFF" + lines.map(line => line.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function reportText(r: ReportSummary): string {
  return [
    "ChessCoachPal workplace report",
    "Period: " + r.from + " through " + r.to + " (" + r.timezone + ")",
    "Sessions: " + r.sessions + " (cancelled: " + r.cancelled + ")",
    "Teaching minutes: " + r.teachingMinutes,
    "Participants: " + r.participants,
    ...(["present", "absent", "late", "excused", "unmarked"] as const)
      .map(status => status + ": " + r.attendance[status]),
  ].join("\n") + "\n";
}
