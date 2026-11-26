import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolveTeacherWorkplaceFilter, teacherWorkplaceContextGet, WorkplaceContextError } from "@/lib/server/teacher-workplace-context";
import { addDays, DEFAULT_POLICY, toLocalDateString, zonedTimeToUtc } from "@/lib/schedule";
import { teacherDailyRatingFreshness } from "@/lib/server/daily-rating-freshness";
import { teacherDailyRatingReview } from "@/lib/server/daily-rating-review";
import { teacherDailyHomework } from "@/lib/server/daily-homework";
import { workplaceCurrentStudentIds } from "@/lib/server/workplace-student-scope";

/** Shared, teacher-scoped website and MCP dashboard/notification operations. */
export class TeacherOverviewError extends Error {
  constructor(public status: 400 | 500, message: string) { super(message); }
}
type Db = SupabaseClient;

export const teacherDashboardSummaryInput = z.object({
  workplaceId: z.string().uuid().nullable().optional(),
  date: z.iso.date().refine(value => value >= "1900-01-01" && value <= "9998-12-31",
    "Expected a real YYYY-MM-DD date between 1900-01-01 and 9998-12-31").optional(),
  closeReview: z.literal(true).optional(),
  ratingFreshness: z.literal(true).optional(),
  homeworkAfter: z.string().max(58).refine(value => {
    const parts = value.split("~");
    return parts.length === 3 && z.iso.date().safeParse(parts[0]).success &&
      z.iso.date().safeParse(parts[1]).success && parts[1] >= "0001-01-01" && parts[1] <= parts[0] &&
      z.string().uuid().safeParse(parts[2]).success;
  }, "Expected a homework continuation cursor").optional(),
}).strict().refine(value => value.homeworkAfter === undefined ||
  (value.date !== undefined && value.homeworkAfter.slice(0, 10) === value.date),
  "Homework continuation requires a matching due-through date")
  .refine(value => value.closeReview === undefined || value.date !== undefined,
    "Day-end review requires an explicit civil date")
  .refine(value => value.ratingFreshness === undefined || value.date !== undefined,
    "Current rating freshness requires an explicit civil date");

async function dashboardScope(db: Db, teacherId: string, requested?: string | null, now = new Date()) {
  const workplaceId = await resolveTeacherWorkplaceFilter(db, teacherId, requested);
  if (typeof requested === "string") {
    // An archived owned workplace is still a valid explicit history filter.
    const row = await db.from("workplaces").select("id").eq("teacher_id", teacherId)
      .eq("id", requested).maybeSingle();
    if (row.error) throw new TeacherOverviewError(500, "Dashboard unavailable");
    if (!row.data) throw new WorkplaceContextError(404, "WORKPLACE_NOT_FOUND", "Workplace not found");
  }
  const studentIds = workplaceId ? await workplaceCurrentStudentIds(db, teacherId, workplaceId) : null;
  return { workplaceId, studentIds, now, requested };
}

type DashboardScope = Awaited<ReturnType<typeof dashboardScope>>;
const workplaceMatch = (scope: DashboardScope): Record<string, string> =>
  scope.workplaceId ? { workplace_id: scope.workplaceId } : {};

async function dashboardSummary(db: Db, teacherId: string, scope: DashboardScope) {
  const weekAgo = new Date(scope.now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const match = workplaceMatch(scope);
  const results = await Promise.all([
    scope.studentIds ? Promise.resolve({ count: scope.studentIds.size, error: null }) :
      db.from("students").select("id", { count: "exact", head: true })
        .eq("teacher_id", teacherId).is("archived_at", null),
    db.from("workplaces").select("id", { count: "exact", head: true }).eq("teacher_id", teacherId),
    db.from("class_groups").select("id", { count: "exact", head: true }).eq("teacher_id", teacherId)
      .match(match),
    db.from("teaching_sessions").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).match(match).gte("starts_at", weekAgo)
      .lt("starts_at", scope.now.toISOString()),
  ]);
  if (results.some(r => r.error)) throw new TeacherOverviewError(500, "Dashboard unavailable");
  const workplaceCount = results[1].count ?? 0;
  return {
    workplaceId: scope.workplaceId,
    studentCount: results[0].count ?? 0,
    workplaceCount, // Account-wide, including archived owned workplaces.
    scopedWorkplaceCount: scope.workplaceId ? 1 : workplaceCount,
    groupCount: results[2].count ?? 0,
    sessionsThisWeek: results[3].count ?? 0,
  };
}

const DAILY_LIMIT = 24;

const ATTENDANCE_SCAN_LIMIT = 96;
const ATTENDANCE_ROSTER_LIMIT = 256;
type AttendanceAffiliation = { student_id: string };
type AttendanceCandidate = {
  id: string; title: string; starts_at: string; duration_minutes: number; workplace_id: string; status:string;
  roster: AttendanceAffiliation[]; decisions: (AttendanceAffiliation & {status:string})[];
};

type AttendanceTask = Omit<AttendanceCandidate, "roster" | "decisions" | "status"> & {completionHref?:string} & (
  | { reason: "ATTENDANCE_MISSING"; missingCount: number; scheduleHref: string | null }
  | { reason: "ROSTER_NOT_RECORDED" | "ROSTER_LIMIT_EXCEEDED"; missingCount: null; scheduleHref: null }
);

async function dailyMissingAttendance(db: Db, teacherId: string, scope: DashboardScope,
  dayStart: Date, dayEnd: Date, includeCloseReview: boolean,
) {
  const upper = new Date(Math.min(dayEnd.getTime(), scope.now.getTime()));
  const query = () => db.from("teaching_sessions").select(
    "id,title,starts_at,duration_minutes,workplace_id,status," +
    "roster:session_participants!session_participants_session_id_teacher_id_fkey(student_id)," +
    "decisions:session_attendance!session_attendance_session_id_teacher_id_fkey(student_id,status)")
    .eq("teacher_id", teacherId).match(workplaceMatch(scope)).in("status", ["scheduled", "completed"])
    .gte("starts_at", dayStart.toISOString()).lt("starts_at", upper.toISOString())
    .order("starts_at").order("id").limit(ATTENDANCE_SCAN_LIMIT + 1)
    .limit(ATTENDANCE_ROSTER_LIMIT + 1, { referencedTable: "roster" })
    .limit(ATTENDANCE_ROSTER_LIMIT + 1, { referencedTable: "decisions" })
    .overrideTypes<AttendanceCandidate[], { merge: false }>();
  const [result, scheduleSelection] = await Promise.all([
    dayStart < upper ? query() : {data: [], error: null},
    scope.requested === undefined ? scope.workplaceId : teacherWorkplaceContextGet(db, teacherId)
      .then(context => context.selectedWorkplaceId),
  ]);
  if (result.error || !result.data) throw new TeacherOverviewError(500, "Daily attendance unavailable");
  const tasks: AttendanceTask[] = [];
  const pending: (Pick<AttendanceCandidate, "id" | "title" | "starts_at" | "workplace_id"> & {
    attendance: "marked" | "missing" | "unknown" | "cancellation_review";
    missingCount: number | null;
    completionHref?: string;
    scheduleHref: string | null;
  })[] = [];
  for (const {roster, decisions, status, ...session} of result.data.slice(0, ATTENDANCE_SCAN_LIMIT)) {
    const endsAt = Date.parse(session.starts_at) + session.duration_minutes * 60_000;
    if (endsAt > scope.now.getTime()) continue;
    const inSelection = !scheduleSelection || scheduleSelection === session.workplace_id;
    const scheduleHref = inSelection ? "/schedule?session=" + session.id + "#lesson-attendance-" + session.id : null;
    const hasCancellation = decisions.some(row => row.status === "student_cancelled" || row.status === "teacher_cancelled");
    const reason = roster.length > ATTENDANCE_ROSTER_LIMIT || decisions.length > ATTENDANCE_ROSTER_LIMIT
      ? "ROSTER_LIMIT_EXCEEDED" as const : !roster.length ? "ROSTER_NOT_RECORDED" as const : null;
    const decided = new Set(decisions.map(row => row.student_id));
    const missingCount = reason ? null : roster.filter(row => !decided.has(row.student_id)).length;
    const completionHref = status === "scheduled" && roster.length > 0 && roster.length <= 50 &&
      decisions.length <= 50 && inSelection && !hasCancellation
      ? "/coaching?recordSession=" + session.id + "&recordWorkplace=" + (scheduleSelection ?? "all") + "#lesson-completion"
      : undefined;
    if (reason) tasks.push({...session, reason, missingCount: null, scheduleHref: null});
    else if (missingCount) tasks.push({...session, reason: "ATTENDANCE_MISSING", missingCount, completionHref, scheduleHref});
    if (includeCloseReview && status === "scheduled") pending.push({
      id: session.id, title: session.title, starts_at: session.starts_at, workplace_id: session.workplace_id,
      attendance: hasCancellation ? "cancellation_review" : reason ? "unknown" : missingCount ? "missing" : "marked",
      missingCount, completionHref, scheduleHref,
    });
  }
  const scanTruncated = result.data.length > ATTENDANCE_SCAN_LIMIT;
  return {
    missingAttendance: {status: "ready" as const, sessions: tasks.slice(0, DAILY_LIMIT), limit: DAILY_LIMIT,
      truncated: scanTruncated || tasks.length > DAILY_LIMIT},
    ...(includeCloseReview ? {closeReview: {status: "ready" as const, sessions: pending.slice(0, DAILY_LIMIT),
      limit: DAILY_LIMIT, truncated: scanTruncated || pending.length > DAILY_LIMIT}} : {}),
  };
}

async function dailyUpcoming(db: Db, teacherId: string, scope: DashboardScope, requestedDate?: string, homeworkAfter?: string, includeCloseReview = false, includeRatingFreshness = false) {
  const venue = scope.workplaceId ? await db.from("workplaces")
    .select("timezone").eq("teacher_id", teacherId).eq("id", scope.workplaceId).maybeSingle() : null;
  if (venue && (venue.error || !venue.data))
    throw new TeacherOverviewError(500, "Daily lessons unavailable");
  const settings = !venue ? await db.from("teacher_settings").select("timezone")
    .eq("teacher_id", teacherId).maybeSingle() : null;
  if (settings?.error) throw new TeacherOverviewError(500, "Daily lessons unavailable");
  const timeZone = venue?.data?.timezone ?? settings?.data?.timezone ?? DEFAULT_POLICY.timezone;
  const today = toLocalDateString(scope.now, timeZone);
  const date = requestedDate ?? today;
  const dayStart = zonedTimeToUtc(date, "00:00", timeZone);
  const dayEnd = zonedTimeToUtc(addDays(date, 1), "00:00", timeZone);
  const from = new Date(Math.max(scope.now.getTime(), dayStart.getTime()));
  const query = () => db.from("teaching_sessions").select("id,title,starts_at,duration_minutes,workplace_id")
    .eq("teacher_id", teacherId).match(workplaceMatch(scope)).eq("status", "scheduled")
    .gte("starts_at", from.toISOString()).lt("starts_at", dayEnd.toISOString())
    .order("starts_at").order("id").limit(DAILY_LIMIT + 1);
  const [result, attendance, homework, ratingReview, ratingFreshness] = await Promise.all([
    from < dayEnd ? query() : { data: [], error: null },
    dailyMissingAttendance(db, teacherId, scope, dayStart, dayEnd, includeCloseReview)
      .catch(() => ({missingAttendance: {status: "unavailable" as const},
        ...(includeCloseReview ? {closeReview: {status: "unavailable" as const}} : {})})),
    teacherDailyHomework(db, teacherId, scope.workplaceId, date, homeworkAfter)
      .catch(() => ({status: "unavailable" as const})),
    teacherDailyRatingReview(db,teacherId,scope.workplaceId,dayStart,dayEnd,scope.now)
      .catch(() => ({status:"unavailable" as const})),
    !includeRatingFreshness ? undefined : date!==today ? {status:"current_day_only" as const}
      : teacherDailyRatingFreshness(db,teacherId,scope.workplaceId,scope.now)
        .catch(()=>({status:"unavailable" as const})),
  ]);
  if (result.error || !result.data) throw new TeacherOverviewError(500, "Daily lessons unavailable");
  return { date, timeZone, limit: DAILY_LIMIT, truncated: result.data.length > DAILY_LIMIT,
    sessions: result.data.slice(0, DAILY_LIMIT), ...attendance, homework, ratingReview, ...(ratingFreshness ? {ratingFreshness} : {}) };
}

export async function teacherDashboardSummary(db: Db, teacherId: string, requested?: string | null, date?: string, homeworkAfter?: string, includeCloseReview = false, includeRatingFreshness = false) {
  const scope = await dashboardScope(db, teacherId, requested);
  if (date === undefined) return dashboardSummary(db, teacherId, scope);
  const [summary, daily] = await Promise.all([
    dashboardSummary(db, teacherId, scope), dailyUpcoming(db, teacherId, scope, date, homeworkAfter, includeCloseReview, includeRatingFreshness),
  ]);
  return { ...summary, daily };
}

async function dashboardStudents(db: Db, teacherId: string, studentIds: Set<string> | null) {
  const query = () => db.from("students").select("id,name,level")
    .eq("teacher_id", teacherId).is("archived_at", null).order("name").order("id").limit(9);
  if (!studentIds) {
    const { data, error } = await query();
    if (error) throw new TeacherOverviewError(500, "Dashboard unavailable");
    return data ?? [];
  }
  const ids = [...studentIds];
  const rows: { id: string; name: string; level: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await query().in("id", ids.slice(i, i + 200));
    if (error) throw new TeacherOverviewError(500, "Dashboard unavailable");
    rows.push(...(data ?? []));
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, 9);
}

export async function teacherDashboardPageModel(db: Db, teacherId: string, date?: string, homeworkAfter?: string, includeCloseReview = false, includeRatingFreshness = false) {
  const scope = await dashboardScope(db, teacherId);
  const sessions = () => db.from("teaching_sessions")
    .select("id,title,starts_at,duration_minutes").eq("teacher_id", teacherId).match(workplaceMatch(scope));
  const now = scope.now.toISOString();
  const [summary, students, upcoming, recent, teacher, daily] = await Promise.all([
    dashboardSummary(db, teacherId, scope),
    dashboardStudents(db, teacherId, scope.studentIds),
    sessions().gte("starts_at", now).order("starts_at").limit(6),
    sessions().lt("starts_at", now).order("starts_at", { ascending: false }).limit(5),
    db.from("teachers").select("display_name").eq("id", teacherId).maybeSingle(),
    dailyUpcoming(db, teacherId, scope, date, homeworkAfter, includeCloseReview, includeRatingFreshness).catch(() => null),
  ]);
  if (upcoming.error || recent.error || teacher.error) throw new TeacherOverviewError(500, "Dashboard unavailable");
  return { summary, students, upcoming: upcoming.data, recent: recent.data, teacher: teacher.data, daily };
}

export async function teacherNotificationsList(db: Db, teacherId: string) {
  const { data, error } = await db.from("notifications")
    .select("id, type, title, body, href, read_at, created_at")
    .eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(30);
  if (error) throw new TeacherOverviewError(500, "Notifications unavailable");
  const notifications = data ?? [];
  return { notifications, unreadCount: notifications.filter(n => !n.read_at).length };
}

export async function teacherNotificationsMarkRead(
  db: Db, teacherId: string, options: { id?: string; all?: boolean }
) {
  if (options.all !== true && !options.id)
    throw new TeacherOverviewError(400, "id or all required");
  const now = new Date().toISOString();
  let query = db.from("notifications").update({ read_at: now }).eq("teacher_id", teacherId);
  if (options.all === true) query = query.is("read_at", null);
  else query = query.eq("id", options.id!);
  const { error } = await query;
  if (error) throw new TeacherOverviewError(500, "Notifications unavailable");
  return { ok: true };
}
