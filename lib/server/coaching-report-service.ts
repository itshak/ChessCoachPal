import type { SupabaseClient } from "@supabase/supabase-js";
import type {AppLocale} from "@/i18n/locales";
import type {ReportPresentation} from "@/lib/coaching-report";
import {recordedWorkplaceTimezones,resolveTeacherWorkplaceFilter} from "@/lib/server/teacher-workplace-context";
import {
  summarizeTeaching, validateReportRange, reportPresentation, workplaceDay,
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
  db: SupabaseClient, teacherId: string, requestedWorkplaceId: string|null|undefined, from: string, to: string,
  outputLocale?:AppLocale
): Promise<{ workplace: { id: string; name: string }|null; report: ReportSummary; presentation: ReportPresentation;
  timezonesUsed: string[]; dateBasis: "session_local_timezone_with_fallback" }> {
  if (typeof requestedWorkplaceId==="string"&&!uuid.test(requestedWorkplaceId))
    throw new ReportServiceError(400, "Invalid workplace");
  try {
    validateReportRange(from, to);
  } catch {
    throw new ReportServiceError(400, "Invalid report range");
  }
  try {
    const workplaceId=await resolveTeacherWorkplaceFilter(db,teacherId,requestedWorkplaceId);
    const {data:workplace,error:workplaceError}=workplaceId?await db.from("workplaces")
      .select("id,name,timezone,locale")
      .eq("teacher_id",teacherId).eq("id",workplaceId).maybeSingle():{data:null,error:null};
    if(workplaceError)throw new ReportServiceError(500,"Report unavailable");
    if(workplaceId&&!workplace)throw new ReportServiceError(404,"Workplace not found");
    let timezone:string=workplace?.timezone??"UTC", locale:string=workplace?.locale??"en";
    if(!workplace){
      const [settings,profile]=await Promise.all([
        db.from("teacher_settings").select("timezone").eq("teacher_id",teacherId).maybeSingle(),
        db.from("teachers").select("preferred_locale").eq("id",teacherId).maybeSingle(),
      ]);
      if(settings.error||profile.error)throw new ReportServiceError(500,"Report unavailable");
      timezone=settings.data?.timezone??timezone;
      locale=profile.data?.preferred_locale??locale;
    }
    // UTC superset includes all local dates for any supported IANA timezone.
    const start = new Date(Date.parse(from + "T00:00:00Z") - 86400000).toISOString();
    const end = new Date(Date.parse(to + "T00:00:00Z") + 2 * 86400000).toISOString();
    const sessions: (ReportSession&{workplace_id:string})[] = [];
    for (let offset = 0; ; offset += 500) {
      let selected=db.from("teaching_sessions")
        .select("id,starts_at,duration_minutes,status,workplace_id,local_timezone")
        .eq("teacher_id",teacherId).gte("starts_at",start).lt("starts_at",end)
        .order("id").range(offset,offset+499);
      if(workplaceId)selected=selected.eq("workplace_id",workplaceId);
      const query=await selected;
      if (query.error) throw new ReportServiceError(500, "Report unavailable");
      sessions.push(...(query.data ?? []));
      if ((query.data?.length ?? 0) < 500) break;
      if (sessions.length >= 5000) throw new ReportServiceError(413, "Range too large to report");
    }
    const recordedZones=workplace?new Map([[workplace.id,timezone]]):
      await recordedWorkplaceTimezones(db,teacherId,sessions.filter(s=>!s.local_timezone).map(s=>s.workplace_id));
    const zones=new Set<string>();
    const included:ReportSession[]=[];
    for(const session of sessions){
      const local_timezone=session.local_timezone??recordedZones.get(session.workplace_id)??timezone;
      const day=workplaceDay(session.starts_at,local_timezone);
      if(day<from||day>to)continue;
      included.push({...session,local_timezone});
      zones.add(local_timezone);
    }
    // The attendance ledger contains decisions only; derive "unmarked"
    // for each frozen participant without storing a fake attendance row.
    const attendance: ReportAttendance[] = [];
    for (let i = 0; i < included.length; i += 30) {
      const ids = included.slice(i, i + 30).map(s => s.id);
      const decisions = new Map<string,string>();
      for (let offset = 0; ; offset += 500) {
        const query = await db.from("session_attendance")
          .select("session_id,student_id,status").eq("teacher_id", teacherId)
          .in("session_id", ids).order("session_id").order("student_id")
          .range(offset, offset + 499);
        if (query.error) throw new ReportServiceError(500, "Report unavailable");
        for (const row of query.data ?? [])
          decisions.set(row.session_id+":"+row.student_id,row.status);
        if ((query.data?.length ?? 0) < 500) break;
        if (decisions.size > 30000) throw new ReportServiceError(413, "Range too large to report");
      }
      for (let offset = 0; ; offset += 500) {
        const query = await db.from("session_participants")
          .select("session_id,student_id").eq("teacher_id", teacherId)
          .in("session_id", ids).order("session_id").order("student_id")
          .range(offset, offset + 499);
        if (query.error) throw new ReportServiceError(500, "Report unavailable");
        for (const row of query.data ?? [])
          attendance.push({session_id:row.session_id,
            status:decisions.get(row.session_id+":"+row.student_id)??"unmarked"});
        if (attendance.length > 30000) throw new ReportServiceError(413, "Range too large to report");
        if ((query.data?.length ?? 0) < 500) break;
      }
    }
    const report=summarizeTeaching(
      included,attendance,from,to,timezone,locale
    );
    const timezonesUsed=[...zones].sort();
    report.timezonesUsed=timezonesUsed;
    const presentation=reportPresentation(report,outputLocale);
    return {
      workplace:workplace?{id:workplace.id,name:workplace.name}:null,
      report,presentation,timezonesUsed,dateBasis:"session_local_timezone_with_fallback",
    };
  } catch (error) {
    if (error instanceof ReportServiceError) throw error;
    throw new ReportServiceError(500, "Report unavailable");
  }
}
