import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherAssignmentsList,AssignmentServiceError} from "@/lib/server/training-assignments";

export const coachBriefingSchema=z.object({
  studentId:z.string().uuid(),
  limit:z.number().int().min(1).max(20).default(10),
}).strict();
export type CoachBriefingFilter=z.infer<typeof coachBriefingSchema>;
type Db=SupabaseClient;
export class CoachBriefingError extends Error{
  constructor(public status:number,public code:string,message:string){super(message);}
}
function fail(status:number,code:string,message:string):never{throw new CoachBriefingError(status,code,message);}
function mostRecent<T extends Record<string,unknown>>(arr:T[],dateField:keyof T){
  return [...arr].sort((a,b)=>String(b[dateField]??"").localeCompare(String(a[dateField]??"")))[0]??null;
}

/**
 * Deterministic facts only. Chat clients may rephrase this record, but this
 * service does not grade a student, infer mastery, or contact remote providers.
 */
export async function teacherCoachBriefing(db:Db,teacherId:string,filter:CoachBriefingFilter){
  const {data:student,error:studentError}=await db.from("students")
    .select("id,name,name_aliases,strength,archived_at,updated_at")
    .eq("teacher_id",teacherId).eq("id",filter.studentId).maybeSingle();
  if(studentError)fail(500,"DATABASE_ERROR","Student briefing lookup failed");
  if(!student)fail(404,"NOT_FOUND","Student not found");

  const [sessions,observations,materialRows,homework]=await Promise.all([
    db.from("teaching_sessions").select(
      "id,title,starts_at,duration_minutes,status,lesson_note,workplace_id,session_participants!inner(student_id),session_attendance(student_id,status,note)"
    ).eq("teacher_id",teacherId).eq("session_participants.student_id",filter.studentId)
      .order("starts_at",{ascending:false}).limit(filter.limit),
    db.from("chess_observations").select(
      "id,category_id,observation,observed_at,source,verified_at,session_id"
    ).eq("teacher_id",teacherId).eq("student_id",filter.studentId)
      .not("verified_at","is",null).order("observed_at",{ascending:false}).limit(filter.limit),
    db.from("chess_material_progress").select(
      "id,stage,occurred_on,note,resource_id,session_id,chess_learning_resources(label,url,resource_type,provider_study_id,provider_chapter_id)"
    ).eq("teacher_id",teacherId).eq("student_id",filter.studentId).is("voided_at",null)
      .order("occurred_on",{ascending:false}).limit(filter.limit),
    teacherAssignmentsList(db,teacherId,{studentId:filter.studentId,limit:filter.limit,offset:0}),
  ]);
  if(sessions.error||observations.error||materialRows.error)
    fail(500,"DATABASE_ERROR","Briefing evidence unavailable");
  if(homework instanceof AssignmentServiceError)
    fail(500,"DATABASE_ERROR","Homework evidence unavailable");

  const attendanceFor=(s:{session_attendance?:unknown})=>
    (Array.isArray(s.session_attendance)?s.session_attendance:[])
      .filter((a:{student_id:string})=>a.student_id===filter.studentId);
  const recentSessions=(sessions.data??[]).map(s=>({
    id:s.id,title:s.title,startsAt:s.starts_at,durationMinutes:s.duration_minutes,
    status:s.status,lessonNote:s.lesson_note,workplaceId:s.workplace_id,
    attendance:attendanceFor(s),source:"teaching_sessions",
  }));
  const covered=(materialRows.data??[]).map(row=>{
    const r=Array.isArray(row.chess_learning_resources)
      ?row.chess_learning_resources[0]??null:row.chess_learning_resources??null;
    return {id:row.id,stage:row.stage,occurredOn:row.occurred_on,
      note:row.note,sessionId:row.session_id,resourceId:row.resource_id,
      resource:r,source:"chess_material_progress"};
  });
  const homeworkFacts=homework.assignments.map(row=>{
    const attempts=Array.isArray(row.assignment_attempts)?row.assignment_attempts:[];
    const reviews=Array.isArray(row.assignment_reviews)?row.assignment_reviews:[];
    const attempt=mostRecent(attempts,"recorded_at");
    const review=mostRecent(reviews,"reviewed_at");
    return {id:row.id,material:row.learning_materials,instructions:row.instructions,
      dueOn:row.due_on,createdAt:row.created_at,
      latestAttempt:attempt,latestReview:review,
      // A recorded completion is still not a verified chess skill assessment.
      mastery:"unknown",source:"training_assignments"};
  });
  const unknowns:string[]=[];
  if(student.strength==null)unknowns.push("Teacher-assessed overall strength not recorded");
  if(!observations.data?.length)unknowns.push("No teacher-verified chess observations in this history window");
  if(!covered.length)unknowns.push("No explicit material coverage records in this history window");
  if(!homeworkFacts.length)unknowns.push("No recorded homework assignments in this history window");
  if(homeworkFacts.some(a=>a.latestAttempt===null))
    unknowns.push("Some homework assignments have no recorded attempt or completion evidence");
  unknowns.push("Homework completion alone does not establish mastery");
  return {
    student:{id:student.id,name:student.name,aliases:student.name_aliases??[],
      strength:student.strength??null,archived:student.archived_at!==null},
    recentSessions,verifiedObservations:(observations.data??[]).map(row=>({
      ...row,sourceRecord:"chess_observations",
    })),materialCoverage:covered,assignments:homeworkFacts,
    unknowns,truthBasis:"teacher_owned_records_only",
    historyLimit:filter.limit,
  };
}
