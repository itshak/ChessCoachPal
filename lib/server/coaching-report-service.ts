import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summarizeTeaching, validateReportRange,
  type ReportAttendance, type ReportSession, type ReportSummary,
} from "@/lib/coaching-report";

/** The browser and MCP must use this same teacher-scoped report query. */
export class ReportServiceError extends Error {
  constructor(public status: 400 | 404 | 413 | 500, message: string) {
    super(message);
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function workplaceTeachingReport(
  db: SupabaseClient, teacherId: string, workplaceId: string, from: string, to: string
): Promise<{ workplace: { id: string; name: string }; report: ReportSummary }> {
  if (!uuid.test(workplaceId))
    throw new ReportServiceError(400, "Invalid workplace");
  try {
    validateReportRange(from, to);
  } catch {
    throw new ReportServiceError(400, "Invalid report range");
  }
  const { data: workplace, error: workplaceError } = await db.from("workplaces")
    .select("id,name,timezone,locale")
    .eq("teacher_id", teacherId).eq("id", workplaceId).maybeSingle();
  if (workplaceError) throw new ReportServiceError(500, "Report unavailable");
  if (!workplace) throw new ReportServiceError(404, "Workplace not found");

  try {
    // UTC superset includes all local dates for any supported IANA timezone.
    const start = new Date(Date.parse(from + "T00:00:00Z") - 86400000).toISOString();
    const end = new Date(Date.parse(to + "T00:00:00Z") + 2 * 86400000).toISOString();
    const sessions: ReportSession[] = [];
    for (let offset = 0; ; offset += 500) {
      const query = await db.from("teaching_sessions")
        .select("id,starts_at,duration_minutes,status")
        .eq("teacher_id", teacherId).eq("workplace_id", workplaceId)
        .gte("starts_at", start).lt("starts_at", end)
        .order("id").range(offset, offset + 499);
      if (query.error) throw new ReportServiceError(500, "Report unavailable");
      sessions.push(...(query.data ?? []));
      if ((query.data?.length ?? 0) < 500) break;
      if (sessions.length >= 5000) throw new ReportServiceError(413, "Range too large to report");
    }
    const attendance: ReportAttendance[] = [];
    for (let i = 0; i < sessions.length; i += 30) {
      const ids = sessions.slice(i, i + 30).map(s => s.id);
      for (let offset = 0; ; offset += 500) {
        const query = await db.from("session_attendance")
          .select("session_id,status").eq("teacher_id", teacherId)
          .in("session_id", ids).order("session_id").order("student_id")
          .range(offset, offset + 499);
        if (query.error) throw new ReportServiceError(500, "Report unavailable");
        attendance.push(...(query.data ?? []));
        if ((query.data?.length ?? 0) < 500) break;
        if (attendance.length >= 30000) throw new ReportServiceError(413, "Range too large to report");
      }
    }
    return {
      workplace: { id: workplace.id, name: workplace.name },
      report: summarizeTeaching(sessions, attendance, from, to, workplace.timezone, workplace.locale),
    };
  } catch (error) {
    if (error instanceof ReportServiceError) throw error;
    throw new ReportServiceError(500, "Report unavailable");
  }
}
