import {NextRequest,NextResponse} from "next/server";
import {createServiceClient} from "@/lib/supabase/server";
import {addDays,toLocalDateString} from "@/lib/schedule";
import {lessonEvent,icsResponse,icsFilename} from "@/lib/calendar-feed";
import {resolvePortalContext,portalCalendarForContext} from "@/lib/server/portal-scope-service";
import {rejectIfTokenLookupsBlocked,recordTokenLookupFailure}
  from "@/lib/server/token-guard";
export const dynamic="force-dynamic";
/**
 * The URL may resemble a previous portal link, but ONLY a new explicit scoped
 * grant authorizes it. Broad old household tokens always return 404.
 */
export async function GET(req:NextRequest,{params}:{params:Promise<{token:string}>}){
  const blocked=rejectIfTokenLookupsBlocked(req);
  if(blocked)return blocked;
  const {token}=await params,db=createServiceClient();
  const ctx=await resolvePortalContext(db,token);
  if(!ctx||!ctx.grant.permissions.has("calendar")){
    recordTokenLookupFailure(req);
    return NextResponse.json({error:"Not found"},{status:404,
      headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  }
  const today=toLocalDateString(new Date(),ctx.workplace.timezone);
  const rows=await portalCalendarForContext(db,ctx,addDays(today,-7),addDays(today,84));
  const events=rows.filter(row=>row.status!=="cancelled")
    .flatMap(row=>row.participants.filter(p=>p.attendanceStatus!=="teacher_cancelled"&&
      p.attendanceStatus!=="student_cancelled").map(p=>lessonEvent({
        id:row.id,starts_at:row.starts_at,duration_minutes:row.duration_minutes,
        studentName:p.name},ctx.workplace.name,"Chess lesson")));
  const response=icsResponse(events,icsFilename(ctx.student.name));
  response.headers.set("Cache-Control","no-store, private");
  response.headers.set("Referrer-Policy","no-referrer");
  return response;
}
