import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {materialCatalogCreateSchema} from "@/lib/server/learning-materials";

/** Typed task: save explicit chess material/evidence in an existing COMPLETED
 * lesson, with optional new material creation as one local SQL transaction.
 * Both transports use exactly these schemas and the same domain service.
 */
const uuid=z.string().uuid();
const evidenceRow=z.object({
 studentId:uuid,
 stage:z.enum(["assigned","taught","completed"]),
 note:z.string().max(2000).default(""),
}).strict();
const materialChoice=z.object({
 existingMaterialId:uuid.optional(),
 create:materialCatalogCreateSchema.optional(),
}).strict().refine(v=>Number(!!v.existingMaterialId)+Number(!!v.create)===1,{
 message:"Choose exactly one existing material ID OR a fully typed new material",
});
export const materialInLessonPreviewSchema=z.object({
 sessionId:uuid,
 material:materialChoice,
 occurredOn:z.iso.date(),
 studentEvidence:z.array(evidenceRow).min(1).max(50),
}).strict().superRefine((v,ctx)=>{
 if(new Set(v.studentEvidence.map(x=>x.studentId)).size!==v.studentEvidence.length)
  ctx.addIssue({code:"custom",path:["studentEvidence"],
   message:"Only one material-stage decision per learner in this operation"});
});
export const materialInLessonCommitSchema=materialInLessonPreviewSchema.safeExtend({
 expectedSessionUpdatedAt:z.iso.datetime({offset:true}),
 requestId:uuid,
 confirmed:z.literal(true),
}).strict();
export type MaterialLessonPreview=z.infer<typeof materialInLessonPreviewSchema>;
export type MaterialLessonCommit=z.infer<typeof materialInLessonCommitSchema>;

export class MaterialInLessonError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>
 new MaterialInLessonError(status,code,message);

type Db=SupabaseClient;
const teacherLocalDate=(instant:string,zone:string)=>{
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
 }).formatToParts(new Date(instant));
 const part=(type:string)=>parts.find(v=>v.type===type)?.value??"";
 return [part("year"),part("month"),part("day")].join("-");
};
export async function teacherMaterialInLessonPreview(
 db:Db,teacherId:string,input:MaterialLessonPreview,
){
 const a=materialInLessonPreviewSchema.parse(input);
 const [{data:session,error:sessionError},{data:participants,error:peopleError}]=await Promise.all([
  db.from("teaching_sessions")
   .select("id,title,starts_at,local_timezone,workplace_id,updated_at,status")
   .eq("teacher_id",teacherId).eq("id",a.sessionId).maybeSingle(),
  db.from("session_participants").select("student_id")
   .eq("teacher_id",teacherId).eq("session_id",a.sessionId)
   .order("student_id").limit(101),
 ]);
 if(sessionError||peopleError)throw fail(503,"PREVIEW_UNAVAILABLE","Could not verify lesson and roster");
 if(!session||!participants)throw fail(404,"NOT_FOUND","Lesson not available");
 if(participants.length>100)throw fail(413,"ROSTER_LIMIT","Lesson has too many participants");
 const issues:string[]=[];
 if(session.status!=="completed")issues.push("LESSON_NOT_COMPLETED");
 const [{data:workplace,error:workplaceError},{data:attendance,error:attendanceError}]=await Promise.all([
  db.from("workplaces").select("id,timezone").eq("teacher_id",teacherId)
   .eq("id",session.workplace_id).maybeSingle(),
  db.from("session_attendance").select("student_id,status")
   .eq("teacher_id",teacherId).eq("session_id",a.sessionId).limit(101),
 ]);
 if(workplaceError||attendanceError||!workplace||!attendance)
  throw fail(503,"PREVIEW_UNAVAILABLE","Unable to verify local date or attendance");
 const zone=session.local_timezone??workplace.timezone;
 if(teacherLocalDate(session.starts_at,zone)!==a.occurredOn)
  issues.push("MATERIAL_DATE_MISMATCH");
 const roster=new Set(participants.map(p=>p.student_id));
 const attendanceById=new Map(attendance.map(p=>[p.student_id,p.status]));
 for(const item of a.studentEvidence){
  if(!roster.has(item.studentId))issues.push("STUDENT_NOT_IN_SESSION");
  if(item.stage!=="assigned"&&!["present","late"].includes(attendanceById.get(item.studentId)??""))
   issues.push("NO_ATTESTED_PRESENCE_FOR_TAUGHT_OR_COMPLETED");
 }
 let chosenMaterial:null|{id:string;kind:string;title:string}=null;
 if(a.material.existingMaterialId){
  const {data,error}=await db.from("learning_materials")
   .select("id,kind,title,archived_at").eq("teacher_id",teacherId)
   .eq("id",a.material.existingMaterialId).maybeSingle();
  if(error)throw fail(503,"PREVIEW_UNAVAILABLE","Cannot verify learning material");
  if(!data||data.archived_at)issues.push("MATERIAL_NOT_AVAILABLE");
  else chosenMaterial={id:data.id,kind:data.kind,title:data.title};
 }else if(a.material.create){
  const {data,error}=await db.from("learning_materials").select("id")
    .eq("teacher_id",teacherId).eq("kind",a.material.create.kind)
    .ilike("title",a.material.create.title.replace(/[\\%_]/g,"\\$&"))
    .is("archived_at",null).limit(1);
  if(error)throw fail(503,"PREVIEW_UNAVAILABLE","Cannot verify existing material titles");
  if(data?.length)issues.push("MATERIAL_TITLE_ALREADY_EXISTS");
 }
 const canCommit=issues.length===0;
 return {canCommit,issues:[...new Set(issues)],session,selectedStudents:a.studentEvidence.map(x=>x.studentId),
  existingMaterial:chosenMaterial,materialIsNew:!!a.material.create,
  noWrites:true,inferredMastery:false,
  proposedCommit:canCommit?{...a,expectedSessionUpdatedAt:session.updated_at}:null,
  warning:"Only coach-attested stages are recorded. Assigned or taught does not prove mastery; absent students cannot be marked taught or completed. No external provider requests or emails are sent.",
 };
}
export async function teacherMaterialInLessonCommit(
 db:Db,_teacherId:string,input:MaterialLessonCommit,
){
 void _teacherId; // SQL enforces auth.uid and verified frozen roster/attendance.
 const a=materialInLessonCommitSchema.parse(input);
 const {data,error}=await db.rpc("ccp_teacher_lesson_material_use_commit",{
  p_session_id:a.sessionId,p_expected_updated_at:a.expectedSessionUpdatedAt,
  p_material_id:a.material.existingMaterialId??null,
  p_new_material:a.material.create??null,
  p_student_evidence:a.studentEvidence,p_occurred_on:a.occurredOn,p_request_id:a.requestId,
 });
 if(error){
  if(error.code==="23505"||/CONFLICT|STALE|MATERIAL_TITLE_ALREADY_EXISTS/.test(error.message))
   throw fail(409,"CONFLICT","Lesson, title or approval changed; review existing materials and retry with a new request ID");
  if(error.code==="42501"||/NOT_FOUND|UNAUTHENTICATED|NOT_IN_SESSION/.test(error.message))
   throw fail(404,"NOT_FOUND","Lesson, pupil or material is not available to this teacher");
  if(error.code==="23514"||/NOT_COMPLETED|NOT_PRESENT/.test(error.message))
   throw fail(409,"CONFLICT","Complete the lesson and verify learner presence before adding teaching claims");
  if(error.code==="22023"||/INVALID|MISMATCH|DUPLICATE/.test(error.message))
   throw fail(400,"VALIDATION_ERROR","Invalid lesson material, pupil evidence or observed date");
  throw fail(503,"DATABASE_ERROR","Atomic lesson material operation unavailable");
 }
 if(!data||typeof data!=="object"||data.oneTransaction!==true||
   typeof data.materialId!=="string"||!Array.isArray(data.evidenceIds))
  throw fail(503,"DATABASE_ERROR","Incomplete material-in-lesson receipt");
 return data as {sessionId:string;materialId:string;linkId:string;
  newMaterialCreated:boolean;evidenceIds:string[];evidenceCount:number;
  oneTransaction:true;replayed:boolean;inferredMastery:false};
}
