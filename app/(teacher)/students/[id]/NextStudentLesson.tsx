import type {SupabaseClient} from "@supabase/supabase-js";
import Link from "next/link";
import {getLocale,getTranslations} from "next-intl/server";
import {teacherUnifiedLessonHistory} from "@/lib/server/unified-lesson-service";
import {teacherDailyLessonPreparation} from "@/lib/server/daily-lesson-preparation";
import {addDays,toLocalDateString} from "@/lib/schedule";

export async function NextStudentLesson({db,teacherId,studentId,timezone}:{db:SupabaseClient;teacherId:string;studentId:string;timezone:string}){
 const [t,d,locale]=await Promise.all([getTranslations("studentDetail"),getTranslations("dashboard"),getLocale()]);
 const now=new Date(),end=new Date(now.getTime()+30*86400000);
 const from=addDays(toLocalDateString(now,timezone),-2);
 const to=addDays(toLocalDateString(end,timezone),2);
 // The same history service backs MCP. Do not silently choose the wrong
 // earliest session when the bounded response is incomplete.
 const history=await teacherUnifiedLessonHistory(db,teacherId,{from,to,studentId,limit:100,offset:0},{teacherTimezone:timezone}).catch(()=>null);
 const candidate=history&&history.nextOffset===null?history.entries.filter(row=>{
  const starts=Date.parse(row.startsAt);
  return row.status==="scheduled"&&starts>=now.getTime()&&starts<=end.getTime();
 }).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id))[0]:undefined;
 const preparation=candidate?await teacherDailyLessonPreparation(db,teacherId,candidate.id,now).catch(()=>null):null;
 const unavailable=!history||history.nextOffset!==null||Boolean(candidate&&!preparation);
 const lesson=preparation?.lesson;
 const prepareHref=lesson?"/dashboard?prepareSession="+encodeURIComponent(lesson.id)+"#lesson-preparation":null;
 return <section className="rounded-xl border border-border bg-surface p-4 sm:p-5 space-y-2" aria-labelledby="next-student-lesson">
  <h2 id="next-student-lesson" className="text-lg font-semibold">{t("nextLesson")}</h2>
  <p className="text-sm text-muted">{t("nextWindow")}</p>
  {unavailable?<p role="status">{t("nextUnavailable")}</p>:lesson&&prepareHref?<div className="space-y-2">
   <h3 className="text-xl font-semibold break-words"><bdi dir="auto">{lesson.title}</bdi></h3>
   <p><time dateTime={lesson.startsAt}>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:lesson.timeZone}).format(new Date(lesson.startsAt))}</time>
    {" · "}{d("minutes",{count:lesson.durationMinutes})}</p>
   <p className="text-sm text-muted">{d("dailyZone",{zone:lesson.timeZone})}</p>
   <Link className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-primary font-medium" href={prepareHref}>{d("dailyPrepareOpen",{title:lesson.title})}</Link>
  </div>:<p>{t("nextNone")}</p>}
 </section>;
}
