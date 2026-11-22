import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolveTeacherWorkplaceFilter, WorkplaceContextError } from "@/lib/server/teacher-workplace-context";
import { workplaceCurrentStudentIds } from "@/lib/server/workplace-student-scope";

/** Shared, teacher-scoped website and MCP dashboard/notification operations. */
export class TeacherOverviewError extends Error {
  constructor(public status: 400 | 500, message: string) { super(message); }
}
type Db = SupabaseClient;

export const teacherDashboardSummaryInput = z.object({
  workplaceId: z.string().uuid().nullable().optional(),
}).strict();

async function dashboardScope(db: Db, teacherId: string, requested?: string | null) {
  const workplaceId = await resolveTeacherWorkplaceFilter(db, teacherId, requested);
  if (typeof requested === "string") {
    // An archived owned workplace is still a valid explicit history filter.
    const row = await db.from("workplaces").select("id").eq("teacher_id", teacherId)
      .eq("id", requested).maybeSingle();
    if (row.error) throw new TeacherOverviewError(500, "Dashboard unavailable");
    if (!row.data) throw new WorkplaceContextError(404, "WORKPLACE_NOT_FOUND", "Workplace not found");
  }
  const studentIds = workplaceId ? await workplaceCurrentStudentIds(db, teacherId, workplaceId) : null;
  return { workplaceId, studentIds, now: new Date() };
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

export async function teacherDashboardSummary(db: Db, teacherId: string, requested?: string | null) {
  return dashboardSummary(db, teacherId, await dashboardScope(db, teacherId, requested));
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

export async function teacherDashboardPageModel(db: Db, teacherId: string) {
  const scope = await dashboardScope(db, teacherId);
  const sessions = () => db.from("teaching_sessions")
    .select("id,title,starts_at,duration_minutes").eq("teacher_id", teacherId).match(workplaceMatch(scope));
  const now = scope.now.toISOString();
  const [summary, students, upcoming, recent, teacher] = await Promise.all([
    dashboardSummary(db, teacherId, scope),
    dashboardStudents(db, teacherId, scope.studentIds),
    sessions().gte("starts_at", now).order("starts_at").limit(6),
    sessions().lt("starts_at", now).order("starts_at", { ascending: false }).limit(5),
    db.from("teachers").select("display_name").eq("id", teacherId).maybeSingle(),
  ]);
  if (upcoming.error || recent.error || teacher.error) throw new TeacherOverviewError(500, "Dashboard unavailable");
  return { summary, students, upcoming: upcoming.data, recent: recent.data, teacher: teacher.data };
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
