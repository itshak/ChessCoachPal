import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {toLocalDateString} from "@/lib/schedule";

export class LessonTimingError extends Error {
  constructor(public code:string,message:string){super(message);}
}

type Period={
  student_id:string;workplace_id:string;starts_on:string|null;ends_on:string|null;
};

/** Match the frozen enrollment guards: teacher-wide calendar, UTC only when
 * unset, inclusive dates, and an unknown legacy start does not invent a day. */
export async function lessonEnrollmentCalendar(db:SupabaseClient,teacherId:string){
  const {data,error}=await db.from("teacher_settings")
    .select("timezone").eq("teacher_id",teacherId).maybeSingle();
  if(error)throw new LessonTimingError("ENROLLMENTS_UNAVAILABLE",
    "Cannot verify the teacher calendar for workplace enrollment");
  const timezone=data?.timezone??"UTC";
  return (startsAt:string)=>toLocalDateString(new Date(startsAt),timezone);
}

export async function lessonEnrollmentPeriods(db:SupabaseClient,teacherId:string,
  studentIds:string[],workplaceId?:string){
  const periods:Period[]=[];
  const batch=250;
  for(let offset=0;offset<20000;offset+=batch){
    let query=db.from("workplace_enrollments")
      .select("student_id,workplace_id,starts_on,ends_on")
      .eq("teacher_id",teacherId).in("student_id",studentIds).is("cancelled_at",null);
    if(workplaceId)query=query.eq("workplace_id",workplaceId);
    // Period identity is the unique tie breaker for historical rows.
    const {data,error}=await query.order("id").range(offset,offset+batch-1);
    if(error||!data)throw new LessonTimingError("ENROLLMENTS_UNAVAILABLE",
      "Cannot verify workplace enrollment safely");
    periods.push(...data as Period[]);
    if(data.length<batch)return periods;
  }
  throw new LessonTimingError("ENROLLMENTS_LIMIT",
    "Too many enrollment periods for an unambiguous preview");
}

export function effectiveLessonWorkplaces(periods:Period[],studentId:string,date?:string){
  return new Set(periods.filter(period=>period.student_id===studentId&&
    (date===undefined||((period.starts_on===null||period.starts_on<=date)&&
    (period.ends_on===null||period.ends_on>=date)))).map(period=>period.workplace_id));
}
