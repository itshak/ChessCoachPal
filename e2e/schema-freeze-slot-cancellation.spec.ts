import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {dayOfWeek,zonedTimeToUtc} from "../lib/schedule";

function db(key:string){
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,
  {auth:{persistSession:false,autoRefreshToken:false}});
}

async function teacher(admin:SupabaseClient){
 const email=`slot-cancel-${randomUUID()}@example.com`;
 const password="SyntheticCancellation123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 expect((await admin.from("teachers").insert({
  id,email,display_name:"Synthetic recurrence-cancellation teacher",
 })).error).toBeNull();
 const client=db(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
 expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
 return {id,client};
}

test("owner-approved unmaterialized cancellation is exact and regenerates without a lesson",async()=>{
 const admin=db(process.env.SUPABASE_SERVICE_ROLE_KEY!);
 const owner=await teacher(admin);
 const outsider=await teacher(admin);
 try{
  const timezone="Asia/Jerusalem";
  const workplace=await admin.from("workplaces").update({timezone})
   .eq("teacher_id",owner.id).eq("kind","personal").select("id").single();
  expect(workplace.error).toBeNull();
  const learner=await admin.from("students").insert({
   teacher_id:owner.id,name:"Synthetic cancellation learner "+randomUUID(),
  }).select("id").single();
  expect(learner.error).toBeNull();
  expect((await admin.from("workplace_enrollments").insert({
   teacher_id:owner.id,student_id:learner.data!.id,workplace_id:workplace.data!.id,
   source:"manual",
  })).error).toBeNull();
  const original="2060-01-08",neighbor="2060-01-15",historical="2020-01-08";
  const createSlot=async(date:string,active=true,workplaceId:string|null=workplace.data!.id)=>{
   const slot=await admin.from("lesson_slots").insert({
    teacher_id:owner.id,student_id:learner.data!.id,workplace_id:workplaceId,
    day_of_week:dayOfWeek(date),start_date:date,start_time:"00:30:00",
    duration_minutes:45,active,
   }).select("id,updated_at").single();
   expect(slot.error).toBeNull();
   return slot.data!;
  };
  const slot=await createSlot(original);
  const disabled=await createSlot(original,false);
  const malformedId=(await createSlot(original)).id;
  const malformed=await admin.from("lesson_slots").update({duration_minutes:10})
   .eq("id",malformedId).select("id,updated_at").single();
  expect(malformed.error).toBeNull();
  const old=await createSlot(historical,true,null);
  const args={
   p_slot_id:slot.id,p_original_occurrence_on:original,
   p_expected_updated_at:slot.updated_at,p_idempotency_key:randomUUID(),
   p_reason:"Approved teacher cancellation for this date",p_confirmed:true,
  };
  const cancel=(patch:Partial<typeof args>={},client=owner.client)=>
   client.rpc("ccp_canonical_slot_cancel_unmaterialized",{...args,...patch});
  const invalid=async(patch:Partial<typeof args>,message:string,code:string)=>{
   expect((await cancel(patch)).error).toMatchObject({message,code});
  };
  const receipts=()=>admin.from("agent_tool_receipts")
   .select("teacher_id,idempotency_key,receipt")
   .in("teacher_id",[owner.id,outsider.id])
   .eq("operation","canonical.slot.cancel_unmaterialized");
  const exceptions=()=>owner.client.from("slot_occurrence_exceptions")
   .select("id,slot_id,original_occurrence_on,approved_by,action,session_id,reason,request_id,revision")
   .eq("teacher_id",owner.id);
  expect((await cancel({},outsider.client)).error).toMatchObject({
   message:"CANONICAL_SLOT_NOT_FOUND",code:"42501",
  });
  expect((await cancel({},db(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!))).error).not.toBeNull();
  expect((await cancel({},admin)).error).not.toBeNull();
  await invalid({p_confirmed:false},"INVALID_SLOT_CANCELLATION","22023");
  await invalid({p_original_occurrence_on:"2060-01-09"},"SLOT_CANCELLATION_NOT_A_RULE_DATE","22023");
  await invalid({p_original_occurrence_on:"2060-01-01"},"SLOT_CANCELLATION_NOT_A_RULE_DATE","22023");
  await invalid({p_expected_updated_at:"2020-01-01T00:00:00Z"},"CANONICAL_SLOT_REVISION_CONFLICT","23505");
  await invalid({p_slot_id:disabled.id,p_expected_updated_at:disabled.updated_at},
   "SLOT_CANCELLATION_NOT_A_RULE_DATE","22023");
  await invalid({p_slot_id:malformedId,p_expected_updated_at:malformed.data!.updated_at},
   "SLOT_CANCELLATION_NOT_A_RULE_DATE","22023");
  for(const startTime of ["24:00:00","00:30:00.5"]){
   const badTime=await admin.from("lesson_slots").update({duration_minutes:45,start_time:startTime})
    .eq("id",malformedId).select("updated_at").single();
   expect(badTime.error).toBeNull();
   await invalid({p_slot_id:malformedId,p_expected_updated_at:badTime.data!.updated_at},
    "SLOT_CANCELLATION_NOT_A_RULE_DATE","22023");
  }
  await invalid({p_slot_id:old.id,p_expected_updated_at:old.updated_at,p_original_occurrence_on:historical},
   "SLOT_CANCELLATION_NOT_FUTURE","22023");
  expect((await receipts()).data).toEqual([]);
  expect((await exceptions()).data).toEqual([]);

  const [first,retry]=await Promise.all([cancel(),cancel()]);
  expect(first.error).toBeNull();
  expect(retry.error).toBeNull();
  expect([first.data.replayed,retry.data.replayed].sort()).toEqual([false,true]);
  const {replayed,...receipt}=first.data;
  expect(retry.data).toEqual({...receipt,replayed:!replayed});
  expect(receipt).toMatchObject({
   slotId:slot.id,originalOccurrenceOn:original,idempotencyKey:args.p_idempotency_key,
  });
  expect(Date.parse(receipt.slotRevision)).toBe(Date.parse(slot.updated_at));
  const persisted=await exceptions();
  expect(persisted.error).toBeNull();
  expect(persisted.data).toEqual([{
   id:receipt.exceptionId,slot_id:slot.id,original_occurrence_on:original,
   approved_by:owner.id,action:"cancel",session_id:null,reason:args.p_reason,
   request_id:args.p_idempotency_key,revision:1,
  }]);
  expect((await outsider.client.from("slot_occurrence_exceptions")
   .select("id").eq("id",receipt.exceptionId)).data).toEqual([]);
  expect((await owner.client.from("slot_occurrence_exceptions").insert({
   teacher_id:owner.id,slot_id:slot.id,original_occurrence_on:neighbor,
   action:"cancel",approved_by:owner.id,reason:args.p_reason,request_id:randomUUID(),
  })).error).not.toBeNull();
  await invalid({p_reason:"Changed approval reason"},"SLOT_CANCELLATION_REPLAY_CONFLICT","23505");
  await invalid({p_original_occurrence_on:neighbor},"SLOT_CANCELLATION_REPLAY_CONFLICT","23505");
  await invalid({p_idempotency_key:randomUUID()},"SLOT_OCCURRENCE_ALREADY_HAS_EXCEPTION","23505");

  const plan=(minuteCount:number)=>[original,neighbor].map(date=>({
   teacher_id:owner.id,student_id:learner.data!.id,workplace_id:workplace.data!.id,
   slot_id:slot.id,slot_occurrence_date:date,starts_at:zonedTimeToUtc(date,"00:30",timezone).toISOString(),
   duration_minutes:minuteCount,local_timezone:timezone,is_home_visit:false,slot_rate_cents:null,
  }));
  expect(plan(45)[0].starts_at.slice(0,10)).toBe("2060-01-07");
  const materialized=await admin.rpc("ccp_canonical_slot_materialize",{
   p_rows:plan(45),p_teacher_id:owner.id,
  });
  expect(materialized.error).toBeNull();
  expect(materialized.data).toEqual({planned:2,inserted:1});
  const sessions=()=>admin.from("teaching_sessions")
   .select("id,status,slot_occurrence_date,duration_minutes")
   .eq("teacher_id",owner.id).eq("slot_id",slot.id);
  const previous=await sessions();
  expect(previous.error).toBeNull();
  expect(previous.data).toMatchObject([{status:"scheduled",slot_occurrence_date:neighbor}]);
  await invalid({p_original_occurrence_on:neighbor,p_idempotency_key:randomUUID()},
   "SLOT_OCCURRENCE_ALREADY_MATERIALIZED","23514");
  expect((await sessions()).data).toEqual(previous.data);

  const deleteSlot=(slotId:string,key:string)=>owner.client.rpc("ccp_canonical_slot_delete",{
   p_slot_id:slotId,p_idempotency_key:key,
  });
  const deleteKey=randomUUID();
  const retirementRequired={code:"23514",message:"RECURRENCE_SERIES_REQUIRES_RETIREMENT"};
  expect((await deleteSlot(slot.id,deleteKey)).error).toMatchObject(retirementRequired);
  expect((await owner.client.from("lesson_slots").delete().eq("id",slot.id)).error?.code)
   .toBe("42501");
  expect((await admin.from("lesson_slots").delete().eq("id",slot.id)).error)
   .toMatchObject(retirementRequired);
  const deniedDeleteReceipt=await admin.from("agent_tool_receipts").select("idempotency_key")
   .eq("teacher_id",owner.id).eq("idempotency_key",deleteKey);
  expect(deniedDeleteReceipt.error).toBeNull();
  expect(deniedDeleteReceipt.data).toEqual([]);
  expect((await sessions()).data).toEqual(previous.data);
  expect((await exceptions()).data).toEqual(persisted.data);
  expect((await cancel()).data).toEqual({...receipt,replayed:true});
  const plainDelete=await deleteSlot(disabled.id,randomUUID());
  expect(plainDelete.error).toBeNull();
  expect(plainDelete.data).toMatchObject({ok:true});
  expect((await admin.from("lesson_slots").select("id").eq("id",disabled.id)).data).toEqual([]);

  const regenerated=await owner.client.rpc("ccp_canonical_slot_update",{
   p_slot_id:slot.id,p_changes:{durationMinutes:60},p_expected_updated_at:slot.updated_at,
   p_rows:plan(60),p_from:original,p_to:neighbor,p_idempotency_key:randomUUID(),
  });
  expect(regenerated.error).toBeNull();
  expect(regenerated.data).toMatchObject({materialized:{planned:2,inserted:1}});
  expect((await sessions()).data).toMatchObject([
   {status:"scheduled",slot_occurrence_date:neighbor,duration_minutes:60},
  ]);
  const originalReceipt=await cancel();
  expect(originalReceipt.error).toBeNull();
  expect(originalReceipt.data).toEqual({...receipt,replayed:true});
  expect((await receipts()).data).toEqual([{
   teacher_id:owner.id,idempotency_key:args.p_idempotency_key,receipt,
  }]);
  expect((await exceptions()).data).toEqual(persisted.data);

  // Revocation makes the date eligible again but does not erase the original
  // approval or allow a hard delete to strand its immutable receipt.
  const revoked=await admin.from("slot_occurrence_exceptions").update({
   revoked_at:new Date().toISOString(),revoked_by:owner.id,
   revocation_request_id:randomUUID(),
  }).eq("id",receipt.exceptionId).select("id,revision,revoked_at").single();
  expect(revoked.error).toBeNull();
  expect(revoked.data).toMatchObject({id:receipt.exceptionId,revision:2});
  expect(revoked.data?.revoked_at).not.toBeNull();
  expect((await deleteSlot(slot.id,randomUUID())).error).toMatchObject(retirementRequired);
  expect((await sessions()).data).toMatchObject([{slot_occurrence_date:neighbor,duration_minutes:60}]);
  expect((await exceptions()).data).toEqual([{...persisted.data![0],revision:2}]);
  expect((await cancel()).data).toEqual({...receipt,replayed:true});
 }finally{
  expect((await admin.auth.admin.deleteUser(owner.id)).error).toBeNull();
  expect((await admin.auth.admin.deleteUser(outsider.id)).error).toBeNull();
 }
});
