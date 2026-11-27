import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherUnifiedLessonHistory} from "@/lib/server/unified-lesson-service";
import {teacherMaterialHistory} from "@/lib/server/teacher-material-history";
import {teacherAssignmentsList} from "@/lib/server/training-assignments";
import {teacherTrainingPlansList} from "@/lib/server/student-training-plans";
import {getPolicy} from "@/lib/server/scheduling";
import {addDays,toLocalDateString,zonedTimeToUtc} from "@/lib/schedule";

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
  const now=new Date();
  const {data:student,error:studentError}=await db.from("students")
    .select("id,name,archived_at,strength,chess_goals")
    .eq("teacher_id",teacherId).eq("id",input.studentId).maybeSingle();
  if(studentError)throw fail(500,"DATABASE_ERROR","Student details unavailable");
  if(!student)throw fail(404,"NOT_FOUND","Student not found");

  // Resolve omitted bounds in the same teacher-local calendar that the
  // history and observations report. The default is 90 civil days back
  // through today; explicit dates remain exactly as requested.
  let {from,to}=input;
  let teacherTimezone:string|undefined;
  if(from===undefined||to===undefined){
    teacherTimezone=(await getPolicy(db,teacherId)).timezone;
    const today=toLocalDateString(now,teacherTimezone);
    from??=addDays(today,-90);
    to??=today;
  }
  if(from>to)throw fail(400,"VALIDATION_ERROR","End date precedes start date");

  const history=teacherUnifiedLessonHistory(db,teacherId,{
    studentId:student.id,workplaceId:null,from,to,limit:input.limit,offset:0,
  },{teacherTimezone});
  const [lessons,materials,assignments,observationResult,trainingPlans]=await Promise.all([
    history,
    teacherMaterialHistory(db,teacherId,{
      studentId:student.id,from,to,limit:input.limit,offset:0,
      includeVoided:false,
    }),
    teacherAssignmentsList(db,teacherId,{
      studentId:student.id,limit:input.limit,offset:0,
    }),
    history.then(({filter:{timezone}})=>{
      // Standalone observations lack a frozen lesson timezone. Interpret the
      // displayed inclusive range in the same teacher zone as this briefing.
      // Filter before limiting so out-of-window evidence cannot hide matches.
      const start=zonedTimeToUtc(from,"00:00",timezone).toISOString();
      const end=zonedTimeToUtc(addDays(to,1),"00:00",timezone).toISOString();
      return db.from("chess_observations")
        .select("id,category_id,session_id,observation,source,observed_at,verified_at")
        .eq("teacher_id",teacherId).eq("student_id",student.id)
        .not("verified_at","is",null).gte("observed_at",start).lt("observed_at",end)
        .order("observed_at",{ascending:false}).order("id").limit(input.limit);
    }),
    teacherTrainingPlansList(db,teacherId,{
      studentId:student.id,includeArchived:false,limit:input.limit,offset:0,
    }),
  ]);
  if(observationResult.error)
    throw fail(500,"DATABASE_ERROR","Verified observations unavailable");

  // The latest coaching-session timeline intentionally omits private learner
  // comments for a general workplace report. Briefing for ONE identified
  // student may include only that student's own explicitly recorded decision
  // and note. This avoids requiring another MCP attendance lookup and prevents
  // a group pupil's private assessment leaking into another pupil's briefing.
  const recentSessionIds=lessons.entries.filter(item=>item.kind==="coaching")
    .map(item=>item.id);
  let participantNotes:Array<{
    sessionId:string;status:string;note:string;updatedAt:string;
  }>=[];
  if(recentSessionIds.length){
    const {data:notes,error:noteError}=await db.from("session_attendance")
      .select("session_id,status,note,updated_at")
      .eq("teacher_id",teacherId).eq("student_id",student.id)
      .in("session_id",recentSessionIds)
      .order("session_id").limit(input.limit);
    if(noteError)throw fail(503,"BRIEFING_UNAVAILABLE","Student-specific lesson notes unavailable");
    participantNotes=(notes??[]).map(row=>({
      sessionId:row.session_id,status:row.status,
      note:row.note??"",updatedAt:row.updated_at,
    }));
  }

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
  if(!trainingPlans.total)
    unknowns.push("No active training plans or explicitly recorded goal decisions.");
  unknowns.push("Assignment completion and independent skill mastery are distinct; no mastery is inferred.");

  return {
    student:{id:student.id,name:student.name,archived:student.archived_at!==null,
      chessStrength:student.strength??null,teacherGoals:student.chess_goals??""},
    range:{from,to,timezone:lessons.filter.timezone},
    lessonHistory:{
      entries:lessons.entries,total:lessons.total,nextOffset:lessons.nextOffset,
      summary:lessons.summary,summaryScope:lessons.summaryScope,
      participantNotes,
      participantNotesTruthBasis:"explicit_student_attendance_records_only",
    },
    materialCoverage:{
      entries:materials.entries.map(row=>({
        id:row.id,studentId:row.student_id,sessionId:row.session_id,
        materialId:row.material_id,stage:row.stage,occurredOn:row.occurred_on,
        label:row.learning_materials?.title??null,
      })),
      total:materials.total,nextOffset:materials.nextOffset,
      truthBasis:"explicit_teacher_record_only",
    },
    homework:{
      entries:assignmentsSummary,total:assignments.total,
      nextOffset:assignments.nextOffset,
    },
    trainingPlans:{
      entries:trainingPlans.plans.map(plan=>({
        id:plan.id,title:plan.title,status:plan.status,
        revision:plan.revision,goals:plan.goals,
      })),
      total:trainingPlans.total,nextOffset:trainingPlans.nextOffset,
      truthBasis:"explicit_teacher_goal_decisions_only",
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
