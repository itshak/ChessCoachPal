import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherUnifiedLessonHistory} from "@/lib/server/unified-lesson-service";
import {teacherMaterialHistory} from "@/lib/server/teacher-material-history";
import {teacherAssignmentsList} from "@/lib/server/training-assignments";

const uuid=z.string().uuid();
export const coachBriefingSchema=z.object({
  studentId:uuid,
  from:z.iso.date().optional(),to:z.iso.date().optional(),
  limit:z.number().int().min(1).max(50).default(20),
}).strict().refine(x=>!x.from||!x.to||x.from<=x.to,"Invalid date range");

export type CoachBriefingInput=z.infer<typeof coachBriefingSchema>;
export class CoachBriefingError extends Error{
  constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new CoachBriefingError(status,code,message);
type Db=SupabaseClient;

/**
 * A deterministic lesson preparation briefing. No model-composed statements,
 * inferred skill grades, invented provider ratings or guardian contact data.
 * Existing shared services supply the same underlying facts as the website.
 * Source IDs, verification state, evidence stages and unknowns stay visible.
 */
export async function teacherCoachBriefing(db:Db,teacherId:string,input:CoachBriefingInput){
  const today=new Date().toISOString().slice(0,10);
  const ninetyDaysAgo=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
  const from=input.from??ninetyDaysAgo,to=input.to??today;
  if(from>to)throw fail(400,"VALIDATION_ERROR","End date precedes start date");
  const {data:student,error:studentError}=await db.from("students")
    .select("id,name,archived_at,strength,chess_goals")
    .eq("teacher_id",teacherId).eq("id",input.studentId).maybeSingle();
  if(studentError)throw fail(500,"DATABASE_ERROR","Student details unavailable");
  if(!student)throw fail(404,"NOT_FOUND","Student not found");

  const [lessons,materials,assignments,observationResult]=await Promise.all([
    teacherUnifiedLessonHistory(db,teacherId,{
      studentId:student.id,from,to,limit:input.limit,offset:0,
    }),
    teacherMaterialHistory(db,teacherId,{
      studentId:student.id,from,to,limit:input.limit,offset:0,
      includeVoided:false,
    }),
    teacherAssignmentsList(db,teacherId,{
      studentId:student.id,limit:input.limit,offset:0,
    }),
    db.from("chess_observations")
      .select("id,category_id,session_id,observation,source,observed_at,verified_at")
      .eq("teacher_id",teacherId).eq("student_id",student.id)
      .not("verified_at","is",null)
      .order("observed_at",{ascending:false}).limit(input.limit),
  ]);
  if(observationResult.error)
    throw fail(500,"DATABASE_ERROR","Verified observations unavailable");

  const known=observationResult.data??[];
  const assignmentsSummary=assignments.assignments.map(a=>{
    const attempts=a.assignment_attempts??[];
    const reviews=a.assignment_reviews??[];
    return {
      id:a.id,materialId:a.material_id,material:a.learning_materials,
      instructions:a.instructions,dueOn:a.due_on,createdAt:a.created_at,
      attempts:attempts.map(x=>({id:x.id,outcome:x.outcome,recordedAt:x.recorded_at,source:x.source})),
      reviews:reviews.map(x=>({id:x.id,verdict:x.verdict,reviewedAt:x.reviewed_at,attemptId:x.attempt_id})),
      needsCoachReview:attempts.length>0&&reviews.length===0,
      hasRecordedCompletion:attempts.some(x=>x.outcome==="completed"),
    };
  });

  const unknowns:string[]=[];
  if(student.strength==null)
    unknowns.push("Overall chess strength has not been explicitly recorded by the coach.");
  if(!known.length)
    unknowns.push("No verified chess observations are recorded in this briefing window.");
  if(!lessons.total)
    unknowns.push("No lessons are recorded in the selected history window.");
  if(!materials.total)
    unknowns.push("No explicitly attested material coverage is recorded in the selected history window.");
  unknowns.push("Assignment completion and independent skill mastery are distinct; no mastery is inferred.");

  return {
    student:{id:student.id,name:student.name,archived:student.archived_at!==null,
      chessStrength:student.strength??null,teacherGoals:student.chess_goals??""},
    range:{from,to,timezone:lessons.filter.timezone},
    lessonHistory:{
      entries:lessons.entries,total:lessons.total,nextOffset:lessons.nextOffset,
      summary:lessons.summary,summaryScope:lessons.summaryScope,
    },
    materialCoverage:{
      entries:materials.entries.map(row=>({
        id:row.id,studentId:row.student_id,sessionId:row.session_id,
        resourceId:row.resource_id,stage:row.stage,occurredOn:row.occurred_on,
        label:row.chess_learning_resources?.label??null,
      })),
      total:materials.total,nextOffset:materials.nextOffset,
      truthBasis:"explicit_teacher_record_only",
    },
    homework:{
      entries:assignmentsSummary,total:assignments.total,
      nextOffset:assignments.nextOffset,
    },
    verifiedObservations:known.map(o=>({
      id:o.id,categoryId:o.category_id,sessionId:o.session_id,
      observation:o.observation,source:o.source,
      observedAt:o.observed_at,verifiedAt:o.verified_at,
    })),
    unknowns,
    basis:"stored_teacher_owned_records_no_inferred_mastery",
  };
}
