import type {SupabaseClient} from "@supabase/supabase-js";
import {getPolicy} from "@/lib/server/scheduling";
import {toLocalDateString} from "@/lib/schedule";

/**
 * Return the set of current students assigned to a specific owned workplace.
 * This is a VIEW/FILTER, never authorization: teachers remain owners of their
 * complete histories, and a student in two workplaces has one canonical ID.
 * Historical lesson attribution stays on the session itself.
 */
export async function workplaceCurrentStudentIds(db:SupabaseClient,
  teacherId:string,workplaceId:string):Promise<Set<string>> {
  const result=new Set<string>();
  const pageSize=500,maxRows=20000;
  const policy=await getPolicy(db,teacherId);
  const today=toLocalDateString(new Date(),policy.timezone);
  for(let offset=0;offset<=maxRows;offset+=pageSize){
    const {data,error}=await db.from("workplace_enrollments")
      .select("id,student_id").eq("teacher_id",teacherId)
      .eq("workplace_id",workplaceId).is("cancelled_at",null)
      .or(`starts_on.is.null,starts_on.lte.${today}`)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .order("id").range(offset,offset+pageSize-1);
    if(error)throw new Error("WORKPLACE_STUDENT_SCOPE_UNAVAILABLE");
    if(offset+(data?.length??0)>maxRows)
      throw new Error("WORKPLACE_STUDENT_SCOPE_TOO_LARGE");
    const studentIds=[...new Set((data??[]).map(x=>x.student_id))];
    if(studentIds.length){
      const {data:active,error:studentError}=await db.from("students")
        .select("id").eq("teacher_id",teacherId).is("archived_at",null)
        .in("id",studentIds);
      if(studentError)throw new Error("WORKPLACE_STUDENT_SCOPE_UNAVAILABLE");
      for(const student of active??[])result.add(student.id);
    }
    if((data?.length??0)<pageSize)break;
  }
  return result;
}
