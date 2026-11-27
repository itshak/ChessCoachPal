import Link from "next/link";
import {notFound} from "next/navigation";
import {getLocale,getTranslations} from "next-intl/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {sessionsDetails,attendanceList,workplacesList} from "@/lib/server/coach-service";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";

export async function generateMetadata(){
 const t=await getTranslations("coaching");return {title:t("sessions")};
}

export default async function LessonDetailPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!z.string().uuid().safeParse(id).success)notFound();
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return null;
 const lesson=await sessionsDetails(db,user.id,id);
 if(!lesson)notFound();
 const [attendance,workplaces,context,t,h,c,d,common,nav,locale]=await Promise.all([
  attendanceList(db,user.id,id),workplacesList(db,user.id),teacherWorkplaceContextGet(db,user.id),
  getTranslations("coaching"),getTranslations("lessonHistory"),getTranslations("calendar"),
  getTranslations("dashboard"),getTranslations("common"),getTranslations("nav"),getLocale(),
 ]);
 const workspace=workplaces.find(w=>w.id===lesson.workplace_id);
 const inContext=!context.selectedWorkplaceId||context.selectedWorkplaceId===lesson.workplace_id;
 const starts=Date.parse(lesson.starts_at),now=Date.now();
 const ended=starts+lesson.duration_minutes*60000<=now;
 const scheduled=lesson.status==="scheduled";
 const decisions=new Map(attendance.map(row=>[row.student_id,row]));
 const status=(value:string)=>{
  switch(value){
   case "present":case "absent":case "late":case "excused":return t(value);
   case "student_cancelled":return c("student_cancelled");
   case "teacher_cancelled":return c("teacher_cancelled");
   case "unmarked":return c("unmarked");
   default:return common("unknown");
  }
 };
 const lessonStatus=lesson.status==="scheduled"?h("scheduled"):lesson.status==="completed"?h("completed"):lesson.status==="cancelled"?h("cancelled"):common("unknown");
 const scheduleHref="/schedule?session="+encodeURIComponent(id)+"#lesson-notes-"+id;
 const prepareHref="/dashboard?prepareSession="+encodeURIComponent(id)+"#lesson-preparation";
 const closeHref="/coaching?"+new URLSearchParams({recordSession:id,recordWorkplace:context.selectedWorkplaceId??"all"});
 const complete=await getTranslations("lessonCompletion");
 return <article className="max-w-4xl mx-auto min-w-0 text-[15px] leading-relaxed space-y-5">
  <Link href="/coaching" className="inline-flex min-h-11 items-center text-primary">{nav("lessons")}</Link>
  <header className="rounded-xl border border-border bg-surface p-5 space-y-3">
   <div className="flex flex-wrap gap-2 items-start justify-between">
    <h1 className="text-2xl font-semibold break-words"><bdi dir="auto">{lesson.title}</bdi></h1>
    <span className="rounded-lg border border-border px-3 py-1 text-sm">{lessonStatus}</span>
   </div>
   <p className="text-muted">
    <time dateTime={lesson.starts_at}>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:lesson.sessionTimeZone}).format(new Date(lesson.starts_at))}</time>
    {" · "}<bdi dir="auto">{workspace?.name??common("unknown")}</bdi>
   </p>
   <p className="text-sm text-muted">{d("dailyZone",{zone:lesson.sessionTimeZone})}</p>
   <div className="flex flex-wrap gap-4">
    <p className="text-2xl font-semibold tabular-nums">{h("minutes",{count:lesson.duration_minutes})}</p>
    <p className="text-2xl font-semibold tabular-nums">{h("students",{count:lesson.participants?.length??0})}</p>
   </div>
   <div className="flex flex-wrap gap-2">
    {inContext&&scheduled&&starts>=now&&<Link href={prepareHref} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white">{d("dailyPrepareOpen",{title:lesson.title})}</Link>}
    {inContext&&scheduled&&ended&&<Link href={closeHref} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white">{complete("complete")}</Link>}
    <Link href={scheduleHref} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-primary">{c("notes")}</Link>
   </div>
  </header>
  <section aria-label={t("sessionAttendance")} className="rounded-xl border border-border bg-surface p-4 sm:p-5 space-y-3">
   <h2 className="text-lg font-semibold">{t("sessionAttendance")}</h2>
   {!lesson.participants?.length?<p className="text-muted">{t("noParticipants")}</p>:<ul className="space-y-2">
    {lesson.participants.map(participant=>{
     const record=participant.students as unknown as {name:string}|{name:string}[]|null;
     const name=(Array.isArray(record)?record[0]:record)?.name??common("unknown");
     const decision=decisions.get(participant.student_id);
     return <li key={participant.student_id} className="rounded-lg border border-border bg-background p-3 space-y-2">
      <div className="flex flex-wrap gap-2 justify-between items-center">
       <Link href={"/students/"+participant.student_id} className="font-semibold text-primary"><bdi dir="auto">{name}</bdi></Link>
       <span className="rounded-md border border-border px-2 py-1 text-sm">{status(decision?.status??"unmarked")}</span>
      </div>
      {decision?.note&&<div className="border-s-2 border-border ps-3">
       <p className="text-sm font-medium text-muted">{c("teacherAttendanceNote")}</p>
       <p className="whitespace-pre-wrap break-words" dir="auto">{decision.note}</p>
      </div>}
     </li>;
    })}
   </ul>}
  </section>
  <section className="rounded-xl border border-border bg-surface p-4 sm:p-5 space-y-2">
   <h2 className="text-lg font-semibold">{t("sharedNote")}</h2>
   <p className="whitespace-pre-wrap break-words" dir="auto">{lesson.lesson_note||common("unknown")}</p>
   <Link href={scheduleHref} className="inline-flex min-h-11 items-center text-primary underline">{c("saveNotes")}</Link>
  </section>
 </article>;
}
