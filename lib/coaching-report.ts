/** Deterministic, tenant-filtered teaching report calculations (no model inference). */
import {messagesFor} from "@/i18n/messages";
import {supportedLocale, localeDetails, type AppLocale} from "@/i18n/locales";
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
function outputLanguage(report:ReportSummary, locale?:AppLocale):AppLocale {
  return locale ?? supportedLocale(report.locale) ?? "en";
}
function humanLabels(report:ReportSummary, locale?:AppLocale) {
  return messagesFor(outputLanguage(report,locale)).reports;
}
export function reportCsv(r: ReportSummary, outputLocale?:AppLocale): string {
  const t=humanLabels(r,outputLocale);
  const labels=[
    ["Metric",t.metric],["Value",t.value],["From",t.fromShort],["To",t.toShort],
    ["Timezone",t.timezone],["Sessions",t.sessions],["Cancelled",t.cancelled],
    ["Teaching minutes",t.teachingMinutes],["Participants",t.participants]
  ] as const;
  const name=(key:string)=>labels.find(([canonical])=>canonical===key)?.[1]??key;
  const lines=[
    [t.metric,t.value],[name("From"),r.from],[name("To"),r.to],
    [name("Timezone"),r.timezone],[name("Sessions"),String(r.sessions)],
    [name("Cancelled"),String(r.cancelled)],
    [name("Teaching minutes"),String(r.teachingMinutes)],
    [name("Participants"),String(r.participants)],
    ...(["present","absent","late","excused","unmarked"] as const)
      .map(status=>[t.attendance+" "+t[status],String(r.attendance[status])])
  ];
  const cell=(value:string)=>'"'+(/^[=+\-@\t\r]/.test(value)?"'":"")+
    value.replace(/"/g,'""')+'"';
  return "\uFEFF"+lines.map(line=>line.map(cell).join(",")).join("\r\n")+"\r\n";
}
export function reportText(r:ReportSummary,outputLocale?:AppLocale):string {
  const t=humanLabels(r,outputLocale);
  return [
    t.reportHeading,
    t.period+": "+r.from+" — "+r.to+" ("+r.timezone+")",
    t.sessions+": "+r.sessions+" ("+t.cancelled+": "+r.cancelled+")",
    t.teachingMinutes+": "+r.teachingMinutes,
    t.participants+": "+r.participants,
    ...(["present","absent","late","excused","unmarked"] as const)
      .map(status=>t[status]+": "+r.attendance[status])
  ].join("\n")+"\n";
}

/** Human presentation only: stable machine report fields and dates remain untouched. */
export type ReportPresentation = {
  outputLocale:AppLocale; direction:"ltr"|"rtl";
  heading:string; periodLabel:string; period:string;
  timezoneLabel:string; timezone:string;
  metrics:{key:"sessions"|"cancelled"|"teachingMinutes"|"participants";label:string;value:string}[];
  attendance:{status:ReportStatus;label:string;value:string}[];
};
export function reportPresentation(r:ReportSummary, requested?:AppLocale):ReportPresentation {
  const outputLocale=outputLanguage(r,requested);
  const t=humanLabels(r,requested), info=localeDetails[outputLocale];
  const number=new Intl.NumberFormat(info.intl);
  // Render date-only values at UTC noon; never use the server timezone for
  // YYYY-MM-DD source dates or convert them into another calendar day.
  const date=(iso:string)=>new Intl.DateTimeFormat(info.intl,{
    dateStyle:"medium",timeZone:"UTC"
  }).format(new Date(iso+"T12:00:00Z"));
  return {
    outputLocale,direction:info.dir,heading:t.reportHeading,
    periodLabel:t.period,period:date(r.from)+" — "+date(r.to),
    timezoneLabel:t.timezone,timezone:r.timezone,
    metrics:([
      ["sessions",t.sessions,r.sessions],
      ["cancelled",t.cancelled,r.cancelled],
      ["teachingMinutes",t.teachingMinutes,r.teachingMinutes],
      ["participants",t.participants,r.participants]
    ] as const).map(([key,label,value])=>({key,label,value:number.format(value)})),
    attendance:([
      "present","absent","late","excused","unmarked"
    ] as const).map(status=>({status,label:t[status],value:number.format(r.attendance[status])}))
  };
}
