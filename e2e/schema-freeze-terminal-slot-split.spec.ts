import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {dayOfWeek,zonedTimeToUtc} from "../lib/schedule";

async function tenant(zone:string){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const owner=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email="terminal-slot-"+randomUUID()+"@example.invalid",password="SyntheticTerminal-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 expect((await admin.from("teachers").insert({id,email,display_name:"Synthetic terminal recurrence"})).error).toBeNull();
 expect((await owner.auth.signInWithPassword({email,password})).error).toBeNull();
 const workplace=await admin.from("workplaces").update({timezone:zone})
  .eq("teacher_id",id).eq("kind","personal").select("id").single();
 expect(workplace.error).toBeNull();
 const student=await admin.from("students").insert({
  teacher_id:id,name:"Synthetic split pupil "+randomUUID(),
 }).select("id").single();
 expect(student.error).toBeNull();
 const scope={teacher_id:id,workplace_id:workplace.data!.id,student_id:student.data!.id};
 expect((await admin.from("workplace_enrollments").insert({...scope,source:"manual"})).error).toBeNull();
 return {url,admin,owner,id,scope};
}

test("terminal split preserves original dates, reconciles future drafts and rolls back stale or conflicting reviews",async()=>{
 const zone="Asia/Jerusalem";
 const {url,admin,owner,id,scope}=await tenant(zone);
 const peer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const first="2060-01-01",cut="2060-01-08",cancelled="2060-01-15",draft="2060-01-22",end="2060-01-29";
  const beforeRule={...scope,day_of_week:dayOfWeek(first),duration_minutes:45,start_date:first,end_date:end};
  const root=await admin.from("lesson_slots").insert({...beforeRule,start_time:"00:30:00"})
   .select("id,series_id,updated_at").single();
  expect(root.error).toBeNull();
  const rootId=root.data!.id,tailId=randomUUID(),requestId=randomUUID();
  const occurrence=(slotId:string,date:string,time:string)=>({
   ...scope,slot_id:slotId,slot_occurrence_date:date,
   starts_at:zonedTimeToUtc(date,time,zone).toISOString(),local_timezone:zone,
   duration_minutes:45,is_home_visit:false,slot_rate_cents:null,
  });
  const initial=await owner.rpc("ccp_canonical_slot_materialize",{p_rows:
   [first,cut,draft].map(date=>occurrence(rootId,date,"00:30"))});
  expect(initial.error).toBeNull();
  expect(initial.data).toEqual({planned:3,inserted:3});
  expect((await admin.from("teaching_sessions").update({status:"completed",lesson_note:"Protected initial note"})
   .eq("slot_id",rootId).eq("slot_occurrence_date",cut)).error).toBeNull();
  const cancel=await admin.from("slot_occurrence_exceptions").insert({
   teacher_id:id,slot_id:rootId,original_occurrence_on:cancelled,
   action:"cancel",approved_by:id,reason:"Reviewed cancelled original date",request_id:randomUUID(),
  }).select("id").single();
  expect(cancel.error).toBeNull();
  const rows=()=>admin.from("teaching_sessions").select("*").eq("teacher_id",id).order("slot_occurrence_date");
  const slots=()=>admin.from("lesson_slots").select("*").eq("teacher_id",id).order("start_date");
  const receipt=()=>admin.from("agent_tool_receipts").select("receipt")
   .eq("teacher_id",id).eq("idempotency_key",requestId).maybeSingle();
  const args={
   p_slot_id:rootId,p_cutoff:cut,p_tail_id:tailId,p_changes:{startTime:"02:00"},
   p_to:end,p_expected_updated_at:root.data!.updated_at,p_review_digest:null,
   p_idempotency_key:requestId,p_confirmed:false,
  };
  const preview=()=>owner.rpc("ccp_canonical_terminal_slot_split",args);
  const expectedBefore=await slots();
  const initialRows=await rows();
  expect(initialRows.error).toBeNull();
  const initialPreview=await preview();
  expect(initialPreview.error).toBeNull();
  expect(initialPreview.data).toMatchObject({
   seriesId:rootId,predecessorId:rootId,successorId:tailId,cutoff:cut,
   planned:4,replaceableDrafts:1,preservedHistory:1,
  });
  expect((await slots()).data).toEqual(expectedBefore.data);
  expect((await rows()).data).toEqual(initialRows.data);
  expect((await receipt()).data).toBeNull();
  const incomplete=await owner.rpc("ccp_canonical_terminal_slot_split",{...args,p_to:cancelled});
  expect(incomplete.error?.message).toBe("RECURRENCE_SPLIT_REVIEW_RANGE_INCOMPLETE");
  const unsupported=await owner.rpc("ccp_canonical_terminal_slot_split",{...args,p_changes:{dayOfWeek:2}});
  expect(unsupported.error?.message).toBe("RECURRENCE_SPLIT_UNSUPPORTED_FIELDS");
  expect((await peer.rpc("ccp_canonical_terminal_slot_split",args)).error).not.toBeNull();

  // Another reviewed correction after preview changes scoped evidence.
  expect((await admin.from("teaching_sessions").update({lesson_note:"Protected corrected note"})
   .eq("slot_id",rootId).eq("slot_occurrence_date",cut)).error).toBeNull();
  const commit=(digest:string)=>owner.rpc("ccp_canonical_terminal_slot_split",{
   ...args,p_review_digest:digest,p_confirmed:true,
  });
  const stale=await commit(initialPreview.data.reviewDigest);
  expect(stale.error?.message).toBe("RECURRENCE_SPLIT_REVIEW_CONFLICT");
  expect((await receipt()).data).toBeNull();
  const reviewed=await preview();
  expect(reviewed.error).toBeNull();
  expect(reviewed.data.reviewDigest).not.toBe(initialPreview.data.reviewDigest);
  const finalBefore=await rows();
  const untouched=finalBefore.data!.filter(row=>[first,cut].includes(row.slot_occurrence_date));
  const oldDraftId=finalBefore.data!.find(row=>row.slot_occurrence_date===draft)!.id;

  // Occupy one new start from a separate owned series. Materializer failure
  // must roll back the shortened root, inserted tail, draft deletion and receipt.
  const conflictSlot=await admin.from("lesson_slots").insert({
   ...beforeRule,start_date:draft,end_date:draft,start_time:"02:00:00",
  }).select("id").single();
  expect(conflictSlot.error).toBeNull();
  expect((await owner.rpc("ccp_canonical_slot_materialize",{
   p_rows:[occurrence(conflictSlot.data!.id,draft,"02:00")],
  })).error).toBeNull();
  const conflict=await commit(reviewed.data.reviewDigest);
  expect(conflict.error?.code).toBe("23P01");
  expect(conflict.error?.message).toBe("SESSION_CONFLICT");
  expect((await slots()).data?.find(row=>row.id===rootId)).toEqual(expectedBefore.data?.[0]);
  expect((await slots()).data?.some(row=>row.id===tailId)).toBe(false);
  expect((await rows()).data?.some(row=>row.id===oldDraftId)).toBe(true);
  expect((await receipt()).data).toBeNull();
  expect((await owner.rpc("ccp_canonical_slot_delete",{
   p_slot_id:conflictSlot.data!.id,p_idempotency_key:randomUUID(),
  })).error).toBeNull();

  const committed=await commit(reviewed.data.reviewDigest);
  expect(committed.error).toBeNull();
  expect(committed.data).toMatchObject({
   replayed:false,removedFutureDrafts:1,preservedHistory:1,materialized:{planned:4,inserted:2},
  });
  const writtenSlots=await slots();
  expect(writtenSlots.error).toBeNull();
  expect(writtenSlots.data).toHaveLength(2);
  expect(writtenSlots.data![0]).toMatchObject({id:rootId,series_id:rootId,end_date:"2060-01-07"});
  expect(writtenSlots.data![1]).toMatchObject({id:tailId,series_id:rootId,start_date:cut,end_date:end,start_time:"02:00:00"});
  const written=await rows();
  expect(written.error).toBeNull();
  expect(written.data?.filter(row=>row.slot_id===rootId)).toEqual(untouched);
  expect(written.data?.some(row=>row.id===oldDraftId)).toBe(false);
  expect(written.data?.filter(row=>row.slot_id===tailId).map(row=>[row.slot_occurrence_date,new Date(row.starts_at).toISOString()]))
   .toEqual([draft,end].map(date=>[date,zonedTimeToUtc(date,"02:00",zone).toISOString()]));
  const preserved=await admin.from("slot_occurrence_exceptions").select("slot_id,original_occurrence_on,revoked_at")
   .eq("id",cancel.data!.id).single();
  expect(preserved.data).toEqual({slot_id:rootId,original_occurrence_on:cancelled,revoked_at:null});
  const replay=await commit(reviewed.data.reviewDigest);
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual({...committed.data,replayed:true});
  expect((await rows()).data).toEqual(written.data);
  const mismatched=await owner.rpc("ccp_canonical_terminal_slot_split",{
   ...args,p_changes:{durationMinutes:60},p_review_digest:reviewed.data.reviewDigest,p_confirmed:true,
  });
  expect(mismatched.error?.message).toBe("RECURRENCE_SPLIT_REPLAY_CONFLICT");
  expect((await owner.rpc("ccp_canonical_terminal_slot_split",{
   ...args,p_expected_updated_at:writtenSlots.data![0].updated_at,p_tail_id:randomUUID(),
  })).error?.message).toBe("RECURRENCE_SPLIT_REQUIRES_TERMINAL_SEGMENT");
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});

test("terminal split refuses nonexistent and ambiguous reviewed local starts",async()=>{
 const {admin,owner,id,scope}=await tenant("Europe/Berlin");
 try{
  const lastSunday=(month:number)=>{
   const d=new Date(Date.UTC(2060,month,0));
   d.setUTCDate(d.getUTCDate()-d.getUTCDay());
   return d.toISOString().slice(0,10);
  };
  const root=await admin.from("lesson_slots").insert({
   ...scope,day_of_week:0,start_date:"2060-01-01",end_date:"2060-11-01",
   start_time:"10:30:00",duration_minutes:45,
  }).select("id,updated_at").single();
  expect(root.error).toBeNull();
  for(const day of [lastSunday(3),lastSunday(10)]){
   const attempt=await owner.rpc("ccp_canonical_terminal_slot_split",{
    p_slot_id:root.data!.id,p_cutoff:day,p_tail_id:randomUUID(),p_changes:{startTime:"02:30"},
    p_to:day,p_expected_updated_at:root.data!.updated_at,p_review_digest:null,
    p_idempotency_key:null,p_confirmed:false,
   });
   expect(attempt.error?.message,day).toBe("RECURRENCE_SPLIT_AMBIGUOUS_LOCAL_TIME");
  }
  expect((await admin.from("lesson_slots").select("id").eq("teacher_id",id)).data).toHaveLength(1);
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
