import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizeTeaching, validateReportRange, type ReportAttendance, type ReportSession } from "@/lib/coaching-report";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return respond({ error: "Unauthorized" }, 401);
  const workplaceId = request.nextUrl.searchParams.get("workplaceId") ?? "";
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!uuid.test(workplaceId)) return respond({ error: "Invalid workplace" }, 400);
  try { validateReportRange(from, to); }
  catch { return respond({ error: "Invalid report range" }, 400); }

  const { data: workplace, error } = await db.from("workplaces")
    .select("id,name,timezone,locale")
    .eq("teacher_id", user.id).eq("id", workplaceId).maybeSingle();
  if (error) return respond({ error: "Report unavailable" }, 500);
  if (!workplace) return respond({ error: "Workplace not found" }, 404);
  try {
    // Fetch a safe UTC superset, then enforce precise workplace-local calendar days.
    // At most +/-14h around midnight can belong to the requested local date.
    const start = new Date(Date.parse(from + "T00:00:00Z") - 86400000).toISOString();
    const end = new Date(Date.parse(to + "T00:00:00Z") + 2 * 86400000).toISOString();
    const sessions: ReportSession[] = [];
    for (let offset = 0; ; offset += 500) {
      const query = await db.from("teaching_sessions")
        .select("id,starts_at,duration_minutes,status")
        .eq("teacher_id", user.id).eq("workplace_id", workplaceId)
        .gte("starts_at", start).lt("starts_at", end)
        .order("id").range(offset, offset + 499);
      if (query.error) return respond({ error: "Report unavailable" }, 500);
      sessions.push(...(query.data ?? []));
      if ((query.data?.length ?? 0) < 500) break;
      if (sessions.length >= 5000) return respond({ error: "Range too large to report" }, 413);
    }
    const attendance: ReportAttendance[] = [];
    for (let i = 0; i < sessions.length; i += 30) {
      const ids = sessions.slice(i, i + 30).map(s => s.id);
      for (let offset = 0; ; offset += 500) {
        const query = await db.from("session_attendance")
          .select("session_id,status").eq("teacher_id", user.id)
          .in("session_id", ids).order("session_id").order("student_id")
          .range(offset, offset + 499);
        if (query.error) return respond({ error: "Report unavailable" }, 500);
        attendance.push(...(query.data ?? []));
        if ((query.data?.length ?? 0) < 500) break;
        if (attendance.length >= 30000) return respond({ error: "Range too large to report" }, 413);
      }
    }
    const report = summarizeTeaching(sessions, attendance, from, to, workplace.timezone, workplace.locale);
    return respond({ workplace: { id: workplace.id, name: workplace.name }, report });
  } catch {
    return respond({ error: "Report unavailable" }, 500);
  }
}
