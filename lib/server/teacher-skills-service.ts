import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrSeedDimensions } from "@/lib/server/skills";
import { getPolicy } from "@/lib/server/scheduling";
import { toLocalDateString } from "@/lib/schedule";

type Db = SupabaseClient;
export class TeacherSkillsError extends Error {
  constructor(public status: number, public code: string, message: string) {super(message);}
}
const failure = (status:number,code:string,message:string) => new TeacherSkillsError(status,code,message);
export async function skillDimensionsList(db: Db, teacherId:string) {
  try {return await getOrSeedDimensions(db,teacherId);} catch {throw failure(500,"DATABASE_ERROR","Unable to list skill dimensions");}
}
export async function skillDimensionsCreate(db:Db,teacherId:string,name:string) {
  const value=name.trim();
  if (!value || value.length > 120) throw failure(400,"VALIDATION_ERROR","Skill name must contain 1–120 characters");
  // Scope the order lookup: another teacher's dimensions must not affect ours.
  const {data:last,error:lastError}=await db.from("skill_dimensions").select("sort_order")
    .eq("teacher_id",teacherId).order("sort_order",{ascending:false}).limit(1).maybeSingle();
  if(lastError) throw failure(500,"DATABASE_ERROR","Unable to create skill");
  const {data,error}=await db.from("skill_dimensions").insert({
    teacher_id:teacherId,name:value,sort_order:(last?.sort_order ?? -1)+1,
  }).select("id,name,sort_order").single();
  if(error?.code==="23505") throw failure(409,"CONFLICT","A skill with this name already exists");
  if(error||!data) throw failure(500,"DATABASE_ERROR","Unable to create skill");
  return data;
}
export async function skillDimensionsUpdate(db:Db,teacherId:string,id:string,name:string) {
  const value=name.trim();
  if(!value||value.length>120) throw failure(400,"VALIDATION_ERROR","Skill name must contain 1–120 characters");
  const {data,error}=await db.from("skill_dimensions").update({name:value})
    .eq("id",id).eq("teacher_id",teacherId).select("id,name,sort_order").maybeSingle();
  if(error?.code==="23505") throw failure(409,"CONFLICT","A skill with this name already exists");
  if(error) throw failure(500,"DATABASE_ERROR","Unable to update skill");
  if(!data) throw failure(404,"NOT_FOUND","Skill dimension not found");
  return data;
}
/** Refuse ordinary deletion of dimensions that hold teacher-attested skill history. */
export async function skillDimensionsDeleteImpact(db:Db,teacherId:string,id:string) {
  const {data:dimension,error:lookupError}=await db.from("skill_dimensions")
    .select("id").eq("id",id).eq("teacher_id",teacherId).maybeSingle();
  if(lookupError) throw failure(500,"DATABASE_ERROR","Unable to inspect skill");
  if(!dimension) throw failure(404,"NOT_FOUND","Skill dimension not found");
  const {count,error:countError}=await db.from("skill_assessments")
    .select("id",{count:"exact",head:true}).eq("dimension_id",id);
  if(countError) throw failure(500,"DATABASE_ERROR","Unable to inspect rating history");
  const assessmentCount=count??0;
  return {dimensionId:id,assessmentCount,canDelete:assessmentCount===0};
}
export async function skillDimensionsDelete(
  db:Db,teacherId:string,id:string,expectedAssessmentCount:number
) {
  if(expectedAssessmentCount!==0)
    throw failure(409,"CONFLICT","Assessed skills cannot be deleted. Rename the dimension to preserve student history.");
  const impact=await skillDimensionsDeleteImpact(db,teacherId,id);
  if(!impact.canDelete)
    throw failure(409,"CONFLICT","The skill has historical assessments. Rename it instead of deleting them.");
  // The database trigger also rejects a concurrent new rating after preview.
  const {data,error}=await db.from("skill_dimensions").delete()
    .eq("id",id).eq("teacher_id",teacherId).select("id").maybeSingle();
  if(error?.code==="23503")
    throw failure(409,"CONFLICT","Skill history changed; deletion was refused. Refresh the preview.");
  if(error) throw failure(500,"DATABASE_ERROR","Unable to delete skill dimension");
  if(!data) throw failure(404,"NOT_FOUND","Skill dimension not found");
  return {ok:true,deletedAssessmentCount:0};
}
export async function studentSkillAssessmentsList(db:Db,teacherId:string,studentId:string) {
  const {data:student,error:lookup}=await db.from("students").select("id")
    .eq("id",studentId).eq("teacher_id",teacherId).maybeSingle();
  if(lookup) throw failure(500,"DATABASE_ERROR","Unable to load student skills");
  if(!student) throw failure(404,"NOT_FOUND","Student not found");
  const {data,error}=await db.from("skill_assessments")
    .select("id,dimension_id,rating,note,assessed_on,created_at")
    .eq("student_id",studentId).order("assessed_on").order("created_at").limit(1000);
  if(error) throw failure(500,"DATABASE_ERROR","Unable to load student skills");
  return data??[];
}
export type SkillRating = {dimensionId:string;rating:number;note?:string};
export async function studentSkillAssessmentsRecord(db:Db,teacherId:string,studentId:string,ratings:SkillRating[]) {
  if(!ratings.length||ratings.length>20||ratings.some(r=>!Number.isInteger(r.rating)||r.rating<1||r.rating>5||r.note?.length && r.note.length>2000))
    throw failure(400,"VALIDATION_ERROR","Provide 1–20 ratings, each 1–5 with optional short notes");
  const {data:student,error:studentError}=await db.from("students").select("id")
    .eq("id",studentId).eq("teacher_id",teacherId).maybeSingle();
  if(studentError) throw failure(500,"DATABASE_ERROR","Student lookup failed");
  if(!student) throw failure(404,"NOT_FOUND","Student not found");
  const ids=[...new Set(ratings.map(r=>r.dimensionId))];
  if(ids.length!==ratings.length) throw failure(400,"VALIDATION_ERROR","Use each skill dimension once per assessment round");
  const {data:dimensions,error:dimError}=await db.from("skill_dimensions").select("id")
    .eq("teacher_id",teacherId).in("id",ids);
  if(dimError) throw failure(500,"DATABASE_ERROR","Skill lookup failed");
  if(dimensions?.length!==ids.length) throw failure(404,"NOT_FOUND","Skill dimension not found");
  const policy=await getPolicy(db,teacherId);
  const assessedOn=toLocalDateString(new Date(),policy.timezone);
  const {data,error}=await db.from("skill_assessments").insert(ratings.map(r=>({
    student_id:studentId,dimension_id:r.dimensionId,rating:r.rating,
    note:typeof r.note==="string"&&r.note.trim()?r.note.trim():null,assessed_on:assessedOn,
  }))).select("id,dimension_id,rating,note,assessed_on,created_at");
  if(error) throw failure(500,"DATABASE_ERROR","Unable to record skill assessment");
  return data??[];
}
