import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared, teacher-scoped website and MCP dashboard/notification operations. */
export class TeacherOverviewError extends Error {
  constructor(public status: 400 | 500, message: string) { super(message); }
}
type Db = SupabaseClient;

export async function teacherDashboardSummary(db: Db, teacherId: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const results = await Promise.all([
    db.from("students").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).is("archived_at", null),
    db.from("workplaces").select("id", { count: "exact", head: true }).eq("teacher_id", teacherId),
    db.from("class_groups").select("id", { count: "exact", head: true }).eq("teacher_id", teacherId),
    db.from("teaching_sessions").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).gte("starts_at", weekAgo),
  ]);
  if (results.some(r => r.error)) throw new TeacherOverviewError(500, "Dashboard unavailable");
  return {
    studentCount: results[0].count ?? 0,
    workplaceCount: results[1].count ?? 0,
    groupCount: results[2].count ?? 0,
    sessionsThisWeek: results[3].count ?? 0,
  };
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
