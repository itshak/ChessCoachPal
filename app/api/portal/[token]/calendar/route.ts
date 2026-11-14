import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPolicy } from "@/lib/server/scheduling";
import {materializeCanonicalSessions} from "@/lib/server/canonical-calendar-service";
import {canonicalCalendarWindow} from "@/lib/server/canonical-calendar-read";
import { addDays, toLocalDateString } from "@/lib/schedule";
import { familyDisplayName } from "@/lib/guardians";
import {
  lessonEvent,
  icsResponse,
  icsFilename,
} from "@/lib/calendar-feed";
import {
  rejectIfTokenLookupsBlocked,
  recordTokenLookupFailure,
} from "@/lib/server/token-guard";

/**
 * Per-family .ics feed (webcal-subscribable). Token-based like the rest of
 * the portal: service-role client + token lookup in application code.
 * UIDs are stable per lesson so calendar clients update instead of
 * duplicating events on refresh.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const blocked = rejectIfTokenLookupsBlocked(req);
  if (blocked) return blocked;

  const supabase = createServiceClient();

  const { data: guardian } = await supabase
    .from("guardians")
    .select("id, name, family_name, teacher_id, students ( id, name )")
    .eq("portal_token", token)
    .single();

  if (!guardian) {
    recordTokenLookupFailure(req);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const students = (guardian.students ?? []) as { id: string; name: string }[];
  if (students.length === 0) {
    return icsResponse([], icsFilename(familyDisplayName(guardian)));
  }

  const policy = await getPolicy(supabase, guardian.teacher_id);
  const today = toLocalDateString(new Date(), policy.timezone);
  await materializeCanonicalSessions(supabase,guardian.teacher_id,
    today,addDays(today,84),{trustedServiceRole:true});
  const lessons=await canonicalCalendarWindow(
    supabase,guardian.teacher_id,addDays(today,-7),addDays(today,84),
    policy.timezone,students.map(s=>s.id)
  );
  const events=lessons.filter(l=>l.status!=="cancelled").flatMap(l=>{
    const active=l.participants.filter(p=>
      p.attendanceStatus!=="teacher_cancelled"&&
      p.attendanceStatus!=="student_cancelled");
    if(!active.length)return [];
    return [lessonEvent({
      id:l.id,starts_at:l.starts_at,duration_minutes:l.duration_minutes,
      studentName:active.map(p=>p.name).join(", "),
    },policy.studio_name||"Lessons",policy.lesson_label)];
  });

  return icsResponse(events, icsFilename(familyDisplayName(guardian)));
}
