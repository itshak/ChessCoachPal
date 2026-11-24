import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {dayOfWeek} from "../lib/schedule";

const historyConflict={code:"23514",message:"SESSION_SCHEDULE_HISTORY_CONFLICT"};

test("ordinary scheduling cannot rewrite current-revision recorded or completed lessons",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
 const owner=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 const email=`protected-session-${randomUUID()}@example.com`;
 const password="SyntheticScheduleGuard123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Synthetic scheduled lesson audit",
  })).error).toBeNull();
  expect((await owner.auth.signInWithPassword({email,password})).error).toBeNull();
  const workplace=await admin.from("workplaces").select("id,timezone")
   .eq("teacher_id",teacherId).eq("kind","personal").single();
  expect(workplace.error).toBeNull();
  expect(workplace.data?.timezone).toBe("UTC");
  const student=await admin.from("students").insert({
   teacher_id:teacherId,name:"Synthetic protected lesson learner",
  }).select("id").single();
  expect(student.error).toBeNull();
  const studentId=student.data!.id;
  const workplaceId=workplace.data!.id;
  expect((await admin.from("workplace_enrollments").insert({
   teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,
   source:"manual",starts_on:"2010-01-01",
  })).error).toBeNull();
  const dates=["2060-01-08","2060-01-15","2060-01-22"];
  const slot=await admin.from("lesson_slots").insert({
   teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,
   day_of_week:dayOfWeek(dates[0]),start_date:dates[0],
   start_time:"14:00:00",duration_minutes:45,
  }).select("id").single();
  expect(slot.error).toBeNull();
  const slotId=slot.data!.id;
  const p_rows=dates.map(date=>({
   teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,
   slot_id:slotId,slot_occurrence_date:date,starts_at:date+"T14:00:00Z",
   duration_minutes:45,local_timezone:"UTC",is_home_visit:false,slot_rate_cents:null,
  }));
  const materialize=()=>admin.rpc("ccp_canonical_slot_materialize",{p_teacher_id:teacherId,p_rows});
  const initial=await materialize();
  expect(initial.error).toBeNull();
  expect(initial.data).toEqual({planned:3,inserted:3});
  const rows=()=>admin.from("teaching_sessions").select("*")
   .eq("teacher_id",teacherId).eq("slot_id",slotId).order("slot_occurrence_date");
  const seeded=await rows();
  expect(seeded.error).toBeNull();
  expect(seeded.data).toHaveLength(3);
  const stamped=Object.prototype.hasOwnProperty.call(seeded.data![0],"source_private_series_id");
 if(stamped)expect(seeded.data!.map(row=>row.source_private_series_id)).toEqual([slotId,slotId,slotId]);
 const [completed,marked,pristine]=seeded.data!;
  const commit=(sessionId:string,revision:string|null,changes:Record<string,unknown>,
   attendance:Record<string,unknown>[]=[],requestId=randomUUID())=>
   owner.rpc("ccp_teacher_session_commit",{
    p_session_id:sessionId,p_changes:changes,p_expected_updated_at:revision,
    p_attendance:attendance,p_idempotency_key:requestId,
   });
  const att=(note:string,existing:string|null=null)=>({
   studentId,status:"present",note,expectedUpdatedAt:existing,
  });
  const completion=await commit(completed.id,completed.updated_at,{status:"completed"},
   [att("Reviewed completion")]);
  expect(completion.error).toBeNull();
  const mark=await commit(marked.id,null,{},[att("Attendance before completion")]);
  expect(mark.error).toBeNull();
  const afterEvidence=await rows();
  expect(afterEvidence.error).toBeNull();
  expect(afterEvidence.data?.map(row=>row.status)).toEqual(["completed","scheduled","scheduled"]);
  const [closed,documented]=afterEvidence.data!;
  for(const [row,changes] of [
   [closed,{startsAt:"2060-01-10T14:00:00Z"}],
   [closed,{status:"cancelled"}],
   [closed,{status:"scheduled"}],
   [documented,{durationMinutes:60}],
   [documented,{startsAt:"2060-01-16T14:00:00Z"}],
   [documented,{status:"cancelled"}],
  ] as const){
   const key=randomUUID();
   // Every denial uses the CURRENT stored revision, not a stale token.
   expect((await commit(row.id,row.updated_at,changes,[],key)).error).toMatchObject(historyConflict);
   const receipts=await admin.from("agent_tool_receipts").select("idempotency_key")
    .eq("teacher_id",teacherId).eq("idempotency_key",key);
   expect(receipts.error).toBeNull();
   expect(receipts.data).toEqual([]);
  }
  const legacy=await owner.rpc("agent_coaching_mutate",{
   p_operation:"sessions.cancel",p_payload:{sessionId:documented.id},
   p_expected_updated_at:documented.updated_at,p_idempotency_key:randomUUID(),p_client_id:"synthetic-coach",
  });
  expect(legacy.error).toMatchObject(historyConflict);
  expect((await owner.from("teaching_sessions").update({starts_at:"2060-01-16T14:00:00Z"})
   .eq("id",documented.id)).error).toMatchObject(historyConflict);
  expect((await admin.from("teaching_sessions").update({local_timezone:"Asia/Jerusalem"})
   .eq("id",documented.id)).error).toMatchObject(historyConflict);
  expect((await admin.from("teaching_sessions").update({slot_occurrence_date:"2060-01-16"})
   .eq("id",documented.id)).error).toMatchObject({
    code:"23514",message:stamped?"PRIVATE_SERIES_PROVENANCE_IMMUTABLE":"SESSION_OCCURRENCE_IDENTITY_CONFLICT",
   });
  const afterDenial=await rows();
  expect(afterDenial.error).toBeNull();
  expect(afterDenial.data).toEqual(afterEvidence.data);
  const reviewedNotes=await commit(closed.id,closed.updated_at,{
   title:"Reviewed title correction",lessonNote:"Reviewed shared note correction",
  });
  expect(reviewedNotes.error).toBeNull();
  const reviewedAttendance=await commit(documented.id,null,{},
   [att("Reviewed attendance correction",mark.data.attendance[0].revision)]);
  expect(reviewedAttendance.error).toBeNull();
  expect(reviewedAttendance.data.attendance[0].note).toBe("Reviewed attendance correction");

  const moved=await commit(pristine.id,pristine.updated_at,{startsAt:"2060-01-23T12:00:00Z"});
  expect(moved.error).toBeNull();
  const afterMove=await rows();
  expect(afterMove.error).toBeNull();
  expect(afterMove.data).toMatchObject([
   {id:closed.id,status:"completed",title:"Reviewed title correction",lesson_note:"Reviewed shared note correction"},
   {id:documented.id,status:"scheduled"},
   {id:pristine.id,status:"scheduled",slot_id:slotId,slot_occurrence_date:dates[2]},
  ]);
  expect(Date.parse(afterMove.data![2].starts_at)).toBe(Date.parse("2060-01-23T12:00:00Z"));
  const regenerated=await materialize();
  expect(regenerated.error).toBeNull();
  expect(regenerated.data).toEqual({planned:3,inserted:0});
  expect((await rows()).data).toEqual(afterMove.data);

  // The scope is ordinary schedule mutation, not closing every old unresolved
  // lesson automatically or banning a deliberate pristine status resolution.
  for(const [startsAt,moveAt] of [
   ["2060-01-25T12:00:00Z","2060-01-26T12:00:00Z"],
   ["2020-01-01T12:00:00Z",null],
  ] as const){
   const oneOff=await admin.from("teaching_sessions").insert({
    teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,title:"Unrecorded one-off",
    starts_at:startsAt,duration_minutes:45,lesson_note:"Plan notes do not claim attendance",
   }).select("id,updated_at").single();
   expect(oneOff.error).toBeNull();
   let revision=oneOff.data!.updated_at;
   if(moveAt){
    const edit=await commit(oneOff.data!.id,revision,{startsAt:moveAt,durationMinutes:60});
    expect(edit.error).toBeNull();
    revision=edit.data.revision;
   }
   const canceled=await commit(oneOff.data!.id,revision,{status:"cancelled"});
   expect(canceled.error).toBeNull();
   expect((await commit(oneOff.data!.id,canceled.data.revision,{status:"scheduled"})).error)
    .toMatchObject(historyConflict);
   const attendance=await admin.from("session_attendance").select("id").eq("session_id",oneOff.data!.id);
   const outbox=await admin.from("ccp_delivery_outbox").select("id").eq("session_id",oneOff.data!.id);
   expect(attendance.error).toBeNull();
   expect(outbox.error).toBeNull();
   expect(attendance.data).toEqual([]);
   expect(outbox.data).toEqual([]);
  }
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
