import type {SupabaseClient} from "@supabase/supabase-js";

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
  for(let offset=0;offset<=maxRows;offset+=pageSize){
    const {data,error}=await db.from("workplace_enrollments")
      .select("id,student_id").eq("teacher_id",teacherId)
      .eq("workplace_id",workplaceId).order("id")
      .range(offset,offset+pageSize-1);
    if(error)throw new Error("WORKPLACE_STUDENT_SCOPE_UNAVAILABLE");
    if(offset+(data?.length??0)>maxRows)
      throw new Error("WORKPLACE_STUDENT_SCOPE_TOO_LARGE");
    for(const enrollment of data??[])result.add(enrollment.student_id);
    if((data?.length??0)<pageSize)break;
  }
  return result;
}
