import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {addDays, DEFAULT_POLICY, toLocalDateString, zonedTimeToUtc} from "@/lib/schedule";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";

export const dailyLessonPreparationInput=z.object({sessionId:z.string().uuid()}).strict();
export class DailyPreparationError extends Error {
  constructor(public status:404|500,public code:"NOT_FOUND"|"PREPARATION_UNAVAILABLE",message:string){super(message)}
}

const ROSTER_LIMIT=50;
const MATERIAL_LIMIT=24;
const ACTIVE_PLAN_LIMIT=100;
const storedGoals=z.array(z.object({
  status:z.enum(["planned","in_progress","achieved","abandoned"]),
})).max(20);
type GoalSummary={scope:"teacher_wide"}&(
  {status:"ready";planned:number;inProgress:number}
  | {status:"limited"|"unavailable";planned:null;inProgress:null}
);

/** Plans are learner-level, not workplace evidence. Never export their text or IDs. */
async function currentTrainingGoals(db:SupabaseClient,teacherId:string,students:string[],now:Date):Promise<GoalSummary>{
  const scope="teacher_wide";
  const withheld=(status:"limited"|"unavailable"):GoalSummary=>({
    scope,status,planned:null,inProgress:null,
  });
  try{
    const {data,error}=await db.from("student_training_plans").select("goals")
      .eq("teacher_id",teacherId).in("student_id",students).eq("status","active")
      .lte("created_at",now.toISOString()).order("id").limit(ACTIVE_PLAN_LIMIT+1);
    if(error||!data)return withheld("unavailable");
    if(data.length>ACTIVE_PLAN_LIMIT)return withheld("limited");
    let planned=0,inProgress=0;
    for(const row of data){
      const result=storedGoals.safeParse(row.goals);
      if(!result.success)return withheld("unavailable");
      for(const goal of result.data){
        if(goal.status==="planned")planned++;
        if(goal.status==="in_progress")inProgress++;
      }
    }
    return {scope,status:"ready",planned,inProgress};
  }catch{return withheld("unavailable");}
}
type Session={
  id:string; title:string; workplace_id:string; starts_at:string; duration_minutes:number;
  local_timezone:string|null; roster:{student_id:string}[];
  venue:{timezone:string}|null;
};
type MaterialRow={
  id:string; material_id:string; student_id:string; occurred_on:string; stage:"assigned"|"taught"|"completed";
  material:{title:string}|null;
};

function unavailable():never {
  throw new DailyPreparationError(500,"PREPARATION_UNAVAILABLE","Lesson preparation unavailable");
}
const signal=(count:number)=>({status:count ? "recorded" as const : "not_recorded" as const,count});

/** Exact-session teacher preparation. This never calls the private single-learner briefing. */
export async function teacherDailyLessonPreparation(db:SupabaseClient,teacherId:string,sessionId:string,now=new Date()){
  const selection=(await teacherWorkplaceContextGet(db,teacherId)).selectedWorkplaceId;
  let query=db.from("teaching_sessions").select(
    "id,title,workplace_id,starts_at,duration_minutes,local_timezone,"+
    "roster:session_participants!session_participants_session_id_teacher_id_fkey(student_id),venue:workplaces!teaching_sessions_workplace_id_teacher_id_fkey(timezone)",
  ).eq("teacher_id",teacherId).eq("id",sessionId).eq("status","scheduled").gte("starts_at",now.toISOString())
    .limit(ROSTER_LIMIT+1,{referencedTable:"roster"});
  if(selection) query=query.eq("workplace_id",selection);
  const result=await query.maybeSingle().overrideTypes<Session|null,{merge:false}>();
  if(result.error)unavailable();
  const row=result.data;
  if(!row)throw new DailyPreparationError(404,"NOT_FOUND","Scheduled lesson not found");
  const timeZone=row.local_timezone||row.venue?.timezone||DEFAULT_POLICY.timezone;
  const {id,title,starts_at,duration_minutes,workplace_id}=row;
  const lesson={id,title,startsAt:starts_at,durationMinutes:duration_minutes,workplaceId:workplace_id,timeZone};
  const unknown=(status:"roster_not_recorded"|"roster_limit_exceeded")=>({
    lesson,status,participantCount:null,history:null,trainingGoals:null,
  });
  if(!row.roster.length)return unknown("roster_not_recorded");
  if(row.roster.length>ROSTER_LIMIT)return unknown("roster_limit_exceeded");
  const ids=row.roster.map(r=>r.student_id);
  const today=toLocalDateString(now,timeZone);
  const targetDay=toLocalDateString(new Date(starts_at),timeZone);
  // Date-only material evidence on the upcoming lesson's date has no reliable
  // order relative to that lesson; report only earlier local dates.
  const to=targetDay>today ? today : addDays(today,-1);
  const from=addDays(to,-89);
  const observedFrom=zonedTimeToUtc(from,"00:00",timeZone).toISOString();
  const observedTo=new Date(Math.min(now.getTime(),zonedTimeToUtc(addDays(to,1),"00:00",timeZone).getTime())).toISOString();
  const [m,a,o,trainingGoals]=await Promise.all([
    db.from("material_teaching_evidence")
      .select("id,material_id,student_id,stage,occurred_on,material:learning_materials(title)")
      .eq("teacher_id",teacherId).eq("workplace_id",workplace_id).in("student_id",ids)
      .is("voided_at",null).gte("occurred_on",from).lte("occurred_on",to)
      .order("occurred_on",{ascending:false}).order("id").limit(MATERIAL_LIMIT+1)
      .overrideTypes<MaterialRow[],{merge:false}>(),
    db.from("training_assignments").select("id",{head:true,count:"exact"})
      .eq("teacher_id",teacherId).in("student_id",ids).gte("created_at",observedFrom).lt("created_at",observedTo),
    db.from("chess_observations").select(
      "id,session:teaching_sessions!chess_observations_session_id_teacher_id_fkey!inner(workplace_id)",
      {head:true,count:"exact"},
    ).eq("teacher_id",teacherId).in("student_id",ids).eq("session.workplace_id",workplace_id)
      .not("verified_at","is",null).lte("verified_at",now.toISOString())
      .gte("observed_at",observedFrom).lt("observed_at",observedTo),
    currentTrainingGoals(db,teacherId,ids,now),
  ]);
  if(m.error||!m.data||a.error||a.count===null||o.error||o.count===null)unavailable();
  const truncated=m.data.length>MATERIAL_LIMIT;
  const visible=m.data.slice(0,MATERIAL_LIMIT);
  const participantsWithEvidence=new Set(visible.map(r=>r.student_id)).size;
  const materials=new Map<string,{materialId:string;title:string|null;stage:MaterialRow["stage"];date:string;sourceId:string}>();
  for(const r of visible){
    const key=r.material_id+":"+r.stage;
    if(!materials.has(key))materials.set(key,{materialId:r.material_id,title:r.material?.title??null,
      stage:r.stage,date:r.occurred_on,sourceId:r.id});
  }
  return {
    lesson,status:"ready" as const,participantCount:ids.length,trainingGoals,
    history:{from,to,material:{status:truncated ? "truncated" as const : visible.length ? "recorded" as const : "not_recorded" as const,
      participantsWithEvidence,participantsWithoutEvidence:truncated ? null : ids.length-participantsWithEvidence,
      entries:[...materials.values()]},
    assignments:{...signal(a.count),scope:"teacher_wide" as const},
    verifiedObservations:signal(o.count)},
  };
}
