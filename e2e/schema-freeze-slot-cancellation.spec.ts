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

test("owner-approved cancellation revocation preserves its original audit and never creates a lesson",async()=>{
 const admin=db(process.env.SUPABASE_SERVICE_ROLE_KEY!);
 const owner=await teacher(admin);
 const outsider=await teacher(admin);
 try{
  const workplace=await admin.from("workplaces").select("id,timezone")
   .eq("teacher_id",owner.id).eq("kind","personal").single();
  expect(workplace.error).toBeNull();
  const learner=await admin.from("students").insert({
   teacher_id:owner.id,name:"Synthetic revocation learner "+randomUUID(),
  }).select("id").single();
  expect(learner.error).toBeNull();
  const workplaceId=workplace.data!.id;
  const learnerId=learner.data!.id;
  expect((await admin.from("workplace_enrollments").insert({
   teacher_id:owner.id,student_id:learnerId,workplace_id:workplaceId,source:"manual",
  })).error).toBeNull();
  const original="2060-01-08",other="2060-01-15",legacy="2060-01-22";
  const slot=await admin.from("lesson_slots").insert({
   teacher_id:owner.id,student_id:learnerId,workplace_id:workplaceId,
   day_of_week:dayOfWeek(original),start_date:original,start_time:"14:00:00",
   duration_minutes:45,
  }).select("id,updated_at,series_id").single();
  expect(slot.error).toBeNull();
  const slotId=slot.data!.id;
  expect(slot.data?.series_id).toBe(slotId);
  const approve=(key:string)=>owner.client.rpc("ccp_canonical_slot_cancel_unmaterialized",{
   p_slot_id:slotId,p_original_occurrence_on:original,p_expected_updated_at:slot.data!.updated_at,
   p_idempotency_key:key,p_reason:"Approved original cancellation retained verbatim",p_confirmed:true,
  });
  const firstApproval=await approve(randomUUID());
  expect(firstApproval.error).toBeNull();
  const legacyKey=randomUUID();
  const old=await admin.from("slot_occurrence_exceptions").insert({
   teacher_id:owner.id,slot_id:slotId,original_occurrence_on:legacy,
   action:"cancel",approved_by:owner.id,reason:"Legacy standalone manual approval",
   request_id:legacyKey,
  }).select("id").single();
  expect(old.error).toBeNull();
  const nonCancel=await admin.from("slot_occurrence_exceptions").insert({
   teacher_id:owner.id,slot_id:slotId,original_occurrence_on:other,
   action:"reschedule",approved_by:owner.id,reason:"Existing separate rescheduling intent",
   revised_starts_at:"2060-01-16T14:00:00Z",revised_timezone:"UTC",request_id:randomUUID(),
  }).select("id").single();
  expect(nonCancel.error).toBeNull();

  const args={
   p_exception_id:firstApproval.data.exceptionId as string,p_expected_revision:1,
   p_idempotency_key:randomUUID(),p_confirmed:true,
  };
  const revoke=(patch:Partial<typeof args>={},client=owner.client)=>
   client.rpc("ccp_canonical_slot_revoke_unmaterialized_cancellation",{...args,...patch});
  const readException=(id:string)=>owner.client.from("slot_occurrence_exceptions")
   .select("*").eq("id",id).single();
  const receipts=()=>admin.from("agent_tool_receipts")
   .select("teacher_id,idempotency_key,receipt")
   .in("teacher_id",[owner.id,outsider.id])
   .eq("operation","canonical.slot.revoke_unmaterialized_cancellation");
  const readLessons=()=>admin.from("teaching_sessions").select("*").eq("teacher_id",owner.id);
  const before=await readException(args.p_exception_id);
  expect(before.error).toBeNull();
  expect(before.data).toMatchObject({revision:1,action:"cancel",revoked_at:null});
  const legacyBefore=await readException(old.data!.id);
  expect(legacyBefore.error).toBeNull();

  expect((await revoke({},outsider.client)).error).toMatchObject({
   code:"42501",message:"SLOT_CANCELLATION_NOT_FOUND",
  });
  expect((await revoke({},db(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!))).error).not.toBeNull();
  expect((await revoke({},admin)).error).not.toBeNull();
  expect((await revoke({p_confirmed:false})).error).toMatchObject({
   code:"22023",message:"INVALID_SLOT_CANCELLATION_REVOCATION",
  });
  expect((await revoke({p_expected_revision:2})).error).toMatchObject({
   code:"23505",message:"SLOT_CANCELLATION_REVISION_CONFLICT",
  });
  const conflict={code:"23505",message:"SLOT_CANCELLATION_REVOCATION_REPLAY_CONFLICT"};
  expect((await revoke({p_idempotency_key:firstApproval.data.idempotencyKey})).error)
   .toMatchObject(conflict);
  expect((await revoke({p_exception_id:old.data!.id,p_idempotency_key:legacyKey})).error)
   .toMatchObject(conflict);
  expect((await revoke({p_exception_id:nonCancel.data!.id})).error).toMatchObject({
   code:"23514",message:"SLOT_CANCELLATION_REVOCATION_NOT_SUPPORTED",
  });
  expect((await receipts()).data).toEqual([]);
  expect((await readException(args.p_exception_id)).data).toEqual(before.data);
  expect((await readException(old.data!.id)).data).toEqual(legacyBefore.data);
  expect((await readLessons()).data).toEqual([]);

  const [first,repeat]=await Promise.all([revoke(),revoke()]);
  expect(first.error).toBeNull();
  expect(repeat.error).toBeNull();
  expect([first.data.replayed,repeat.data.replayed].sort()).toEqual([false,true]);
  const {replayed,...receipt}=first.data;
  expect(repeat.data).toEqual({...receipt,replayed:!replayed});
  expect(receipt).toMatchObject({
   exceptionId:args.p_exception_id,slotId,originalOccurrenceOn:original,
   revision:2,revokedBy:owner.id,idempotencyKey:args.p_idempotency_key,
  });
  const revoked=await readException(args.p_exception_id);
  expect(revoked.error).toBeNull();
  expect(revoked.data).toEqual({
   ...before.data,revision:2,revoked_by:owner.id,revoked_at:revoked.data!.revoked_at,
   revocation_request_id:args.p_idempotency_key,
  });
  expect(Date.parse(revoked.data!.revoked_at)).toBe(Date.parse(receipt.revokedAt));
  expect((await readLessons()).data).toEqual([]);
  expect((await revoke({p_expected_revision:2})).error).toMatchObject(conflict);
  expect((await revoke({p_exception_id:old.data!.id})).error).toMatchObject(conflict);
  expect((await revoke({p_idempotency_key:randomUUID(),p_expected_revision:2})).error)
   .toMatchObject({code:"23514",message:"SLOT_CANCELLATION_ALREADY_REVOKED"});

  // The same date can later receive a new approval. Replaying the old
  // revocation returns the original receipt and never touches that successor.
  const successor=await approve(randomUUID());
  expect(successor.error).toBeNull();
  expect(successor.data.exceptionId).not.toBe(args.p_exception_id);
  expect((await revoke()).data).toEqual({...receipt,replayed:true});
  expect((await readException(successor.data.exceptionId)).data).toMatchObject({revoked_at:null,revision:1});
  expect((await revoke({p_exception_id:successor.data.exceptionId,p_idempotency_key:randomUUID()})).error)
   .toBeNull();
  expect((await readLessons()).data).toEqual([]);

  const legacyRequestKey=randomUUID();
  const legacyRevoke=await revoke({p_exception_id:old.data!.id,p_idempotency_key:legacyRequestKey});
  expect(legacyRevoke.error).toBeNull();
  expect((await readException(old.data!.id)).data).toMatchObject({
   ...legacyBefore.data,revision:2,revoked_at:expect.any(String),revoked_by:owner.id,
   revocation_request_id:legacyRequestKey,
  });
  const deniedDelete=await owner.client.rpc("ccp_canonical_slot_delete",{
   p_slot_id:slotId,p_idempotency_key:randomUUID(),
  });
  expect(deniedDelete.error).toMatchObject({code:"23514",message:"RECURRENCE_SERIES_REQUIRES_RETIREMENT"});
  expect((await revoke({p_exception_id:old.data!.id,p_idempotency_key:legacyRequestKey})).data)
   .toEqual({...legacyRevoke.data,replayed:true});
  expect((await readLessons()).data).toEqual([]);

  const materialized=await admin.rpc("ccp_canonical_slot_materialize",{
   p_teacher_id:owner.id,p_rows:[{
    teacher_id:owner.id,student_id:learnerId,workplace_id:workplaceId,slot_id:slotId,
    slot_occurrence_date:original,starts_at:zonedTimeToUtc(original,"14:00",workplace.data!.timezone).toISOString(),
    duration_minutes:45,local_timezone:workplace.data!.timezone,is_home_visit:false,slot_rate_cents:null,
   }],
  });
  expect(materialized.error).toBeNull();
  expect(materialized.data).toEqual({planned:1,inserted:1});
  const lessons=await readLessons();
  expect(lessons.error).toBeNull();
  expect(lessons.data).toMatchObject([{slot_occurrence_date:original,status:"scheduled"}]);
  expect((await revoke()).data).toEqual({...receipt,replayed:true});
  expect((await readLessons()).data).toEqual(lessons.data);
  const stored=await receipts();
  expect(stored.error).toBeNull();
  expect(stored.data).toHaveLength(3);
  expect(stored.data).toContainEqual({
   teacher_id:owner.id,idempotency_key:args.p_idempotency_key,receipt,
  });
 }finally{
  expect((await admin.auth.admin.deleteUser(owner.id)).error).toBeNull();
  expect((await admin.auth.admin.deleteUser(outsider.id)).error).toBeNull();
 }
});

test("revocation fails closed for legacy history and resolves the current series segment",async()=>{
 const admin=db(process.env.SUPABASE_SERVICE_ROLE_KEY!);
 const owner=await teacher(admin);
 try{
  const workplace=await admin.from("workplaces").select("id,timezone")
   .eq("teacher_id",owner.id).eq("kind","personal").single();
  expect(workplace.error).toBeNull();
  const student=await admin.from("students").insert({
   teacher_id:owner.id,name:"Synthetic retained recurrence "+randomUUID(),
  }).select("id").single();
  expect(student.error).toBeNull();
  expect((await admin.from("workplace_enrollments").insert({
   teacher_id:owner.id,student_id:student.data!.id,workplace_id:workplace.data!.id,source:"manual",
  })).error).toBeNull();
  const existingDate="2060-01-08",validDate="2060-01-15",wrongDay="2060-01-16";
  const pastDate="2020-01-08";
  const makeSlot=async(date:string,extra:Record<string,unknown>={})=>{
   const made=await admin.from("lesson_slots").insert({
    teacher_id:owner.id,student_id:student.data!.id,workplace_id:workplace.data!.id,
    day_of_week:dayOfWeek(date),start_date:date,start_time:"14:00:00",
    duration_minutes:45,...extra,
   }).select("id").single();
   expect(made.error).toBeNull();
   return made.data!.id as string;
  };
  const root=await makeSlot(existingDate);
  const pastSlot=await makeSlot(pastDate);
  const noActiveSlot=await makeSlot(validDate,{active:false});
  const gapSlot=await makeSlot("2060-03-14",{start_time:"02:30:00"});
  const materialized=await admin.rpc("ccp_canonical_slot_materialize",{
   p_teacher_id:owner.id,p_rows:[{
    teacher_id:owner.id,student_id:student.data!.id,workplace_id:workplace.data!.id,
    slot_id:root,slot_occurrence_date:existingDate,
    starts_at:zonedTimeToUtc(existingDate,"14:00",workplace.data!.timezone).toISOString(),
    duration_minutes:45,local_timezone:workplace.data!.timezone,is_home_visit:false,slot_rate_cents:null,
   }],
  });
  expect(materialized.error).toBeNull();
  expect(materialized.data).toEqual({planned:1,inserted:1});
  const sessions=()=>admin.from("teaching_sessions").select("*").eq("teacher_id",owner.id);
  const before=await sessions();
  expect(before.error).toBeNull();
  expect(before.data).toMatchObject([{slot_id:root,slot_occurrence_date:existingDate}]);
  expect((await admin.from("lesson_slots").update({active:false}).eq("id",root)).error).toBeNull();
  const tail=await makeSlot(existingDate,{series_id:root});
  const addLegacy=async(slotId:string,date:string)=>{
   const e=await admin.from("slot_occurrence_exceptions").insert({
    teacher_id:owner.id,slot_id:slotId,original_occurrence_on:date,action:"cancel",
    approved_by:owner.id,reason:"Approved legacy unlinked cancellation",
    request_id:randomUUID(),
   }).select("id").single();
   expect(e.error).toBeNull();
   return e.data!.id as string;
  };
  // The old operator exception is physically on the active tail, but the
  // existing actual lesson remains physically on the retired predecessor.
  const legacyMaterialized=await addLegacy(tail,existingDate);
  const legacyPast=await addLegacy(pastSlot,pastDate);
  const legacyNoActive=await addLegacy(noActiveSlot,validDate);
  const legacyWrongDay=await addLegacy(root,wrongDay);
  const legacyHappy=await addLegacy(root,validDate);
  // Future US DST gap: this otherwise valid rule has no real local instant.
  expect((await admin.from("workplaces").update({timezone:"America/New_York"})
   .eq("id",workplace.data!.id)).error).toBeNull();
  const legacyGap=await addLegacy(gapSlot,"2060-03-14");
  const row=(id:string)=>admin.from("slot_occurrence_exceptions").select("id,revoked_at,revision").eq("id",id).single();
  const revoke=(id:string,key:string)=>owner.client.rpc("ccp_canonical_slot_revoke_unmaterialized_cancellation",{
   p_exception_id:id,p_expected_revision:1,p_idempotency_key:key,p_confirmed:true,
  });
  for(const [id,message,code] of [
   [legacyMaterialized,"SLOT_OCCURRENCE_ALREADY_MATERIALIZED","23514"],
   [legacyPast,"SLOT_CANCELLATION_NOT_FUTURE","22023"],
   [legacyNoActive,"SLOT_CANCELLATION_NOT_A_RULE_DATE","22023"],
   [legacyWrongDay,"SLOT_CANCELLATION_NOT_A_RULE_DATE","22023"],
   [legacyGap,"SLOT_CANCELLATION_NOT_FUTURE","22023"],
  ]){
   const key=randomUUID();
   expect((await revoke(id,key)).error).toMatchObject({message,code});
   const after=await row(id);
   expect(after.error).toBeNull();
   expect(after.data).toEqual({id,revoked_at:null,revision:1});
   const deniedReceipt=await admin.from("agent_tool_receipts").select("idempotency_key")
    .eq("teacher_id",owner.id).eq("idempotency_key",key);
   expect(deniedReceipt.error).toBeNull();
   expect(deniedReceipt.data).toEqual([]);
  }

  const acceptedKey=randomUUID();
  const accepted=await revoke(legacyHappy,acceptedKey);
  expect(accepted.error).toBeNull();
  expect(accepted.data).toMatchObject({
   exceptionId:legacyHappy,slotId:root,originalOccurrenceOn:validDate,revision:2,replayed:false,
  });
  expect((await sessions()).data).toEqual(before.data);
  expect((await admin.from("lesson_slots").update({active:false}).eq("id",tail)).error).toBeNull();
  const replay=await revoke(legacyHappy,acceptedKey);
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual({...accepted.data,replayed:true});
  expect((await sessions()).data).toEqual(before.data);
 }finally{
  expect((await admin.auth.admin.deleteUser(owner.id)).error).toBeNull();
 }
});

test("reviewed one-date rescheduling moves only an unmaterialized occurrence",async()=>{
 const admin=db(process.env.SUPABASE_SERVICE_ROLE_KEY!);
 const owner=await teacher(admin);
 const outsider=await teacher(admin);
 try{
  const timezone="Asia/Jerusalem";
  const workplace=await admin.from("workplaces").update({timezone})
   .eq("teacher_id",owner.id).eq("kind","personal").select("id").single();
  expect(workplace.error).toBeNull();
  const distant=await admin.from("workplaces").insert({
   teacher_id:owner.id,kind:"professional",name:"Synthetic New York venue",timezone:"America/New_York",
   currency:"USD",locale:"en",policy:{},
  }).select("id").single();
  expect(distant.error).toBeNull();
  const learner=await admin.from("students").insert({
   teacher_id:owner.id,name:"Synthetic moved lesson learner "+randomUUID(),
  }).select("id").single();
  expect(learner.error).toBeNull();
  for(const workplaceId of [workplace.data!.id,distant.data!.id]){
   const enrolled=await admin.from("workplace_enrollments").insert({
    teacher_id:owner.id,student_id:learner.data!.id,workplace_id:workplaceId,source:"manual",
   });
   expect(enrolled.error).toBeNull();
  }
  const original="2060-01-08",neighbor="2060-01-15",target="2060-01-09";
  const slot=async(date:string,time:string,workplaceId:string)=>{
   const r=await admin.from("lesson_slots").insert({
    teacher_id:owner.id,student_id:learner.data!.id,workplace_id:workplaceId,
    day_of_week:dayOfWeek(date),start_time:time,start_date:date,duration_minutes:45,
    rate_cents:12000,is_home_visit:true,
   }).select("id,updated_at,series_id").single();
   expect(r.error).toBeNull();
   return r.data!;
  };
  const source=await slot(original,"14:00",workplace.data!.id);
  const targetStarts=zonedTimeToUtc(target,"15:00",timezone).toISOString();
  const plan=(date:string)=>({
   teacher_id:owner.id,workplace_id:workplace.data!.id,student_id:learner.data!.id,
   slot_id:source.id,slot_occurrence_date:date,starts_at:zonedTimeToUtc(date,"14:00",timezone).toISOString(),
   duration_minutes:45,local_timezone:timezone,slot_rate_cents:12000,is_home_visit:true,
  });
  const materialize=(dates:string[])=>admin.rpc("ccp_canonical_slot_materialize",{
   p_teacher_id:owner.id,p_rows:dates.map(plan),
  });
  const neighborResult=await materialize([neighbor]);
  expect(neighborResult.error).toBeNull();
  expect(neighborResult.data).toEqual({planned:1,inserted:1});
  const sessions=()=>admin.from("teaching_sessions").select("*").eq("teacher_id",owner.id)
   .eq("slot_id",source.id).order("slot_occurrence_date");
  const baseline=await sessions();
  expect(baseline.error).toBeNull();
  expect(baseline.data).toMatchObject([{slot_occurrence_date:neighbor,status:"scheduled"}]);

  const args={
   p_slot_id:source.id,p_original_occurrence_on:original,p_revised_date:target,p_revised_time:"15:00:00",
   p_expected_updated_at:source.updated_at,p_reason:"Teacher reviewed moving just this occurrence",
   p_review_digest:null as string|null,p_idempotency_key:null as string|null,p_confirmed:false,
  };
  const reschedule=(patch:Partial<typeof args>={},client=owner.client)=>
   client.rpc("ccp_canonical_reschedule_unmaterialized_slot",{...args,...patch});
  const receipts=()=>admin.from("agent_tool_receipts").select("idempotency_key,receipt")
   .in("teacher_id",[owner.id,outsider.id]).eq("operation","canonical.slot.reschedule_unmaterialized");
  const exceptions=()=>owner.client.from("slot_occurrence_exceptions").select("*").eq("slot_id",source.id);
  expect((await reschedule({},outsider.client)).error).toMatchObject({code:"42501",message:"CANONICAL_SLOT_NOT_FOUND"});
  expect((await reschedule({},admin)).error).not.toBeNull();
  expect((await reschedule({},db(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!))).error).not.toBeNull();
  expect((await reschedule({p_expected_updated_at:"2020-01-01T00:00:00Z"})).error)
   .toMatchObject({code:"23505",message:"CANONICAL_SLOT_REVISION_CONFLICT"});
  expect((await reschedule({p_original_occurrence_on:neighbor})).error)
   .toMatchObject({code:"23514",message:"SLOT_OCCURRENCE_ALREADY_MATERIALIZED"});

  const booked=await admin.from("teaching_sessions").insert({
   teacher_id:owner.id,workplace_id:workplace.data!.id,student_id:learner.data!.id,
   title:"Synthetic booked target",starts_at:targetStarts,duration_minutes:45,
  }).select("id").single();
  expect(booked.error).toBeNull();
  expect((await reschedule()).error).toMatchObject({code:"23P01",message:"SESSION_CONFLICT"});
  expect((await admin.from("teaching_sessions").delete().eq("id",booked.data!.id)).error).toBeNull();

  // 08:00 in New York and 15:00 in Jerusalem are the same UTC instant in January.
  const pending=await slot(target,"08:00",distant.data!.id);
  expect((await reschedule()).error)
   .toMatchObject({code:"23P01",message:"SLOT_RESCHEDULE_PENDING_RULE_CONFLICT"});
  const released=await owner.client.rpc("ccp_canonical_slot_cancel_unmaterialized",{
   p_slot_id:pending.id,p_original_occurrence_on:target,p_expected_updated_at:pending.updated_at,
   p_idempotency_key:randomUUID(),p_reason:"Approved cancelling existing target rule date",p_confirmed:true,
  });
  expect(released.error).toBeNull();
  // The initial slice will not schedule over a still-active rule even after
  // cancellation: revocation could otherwise poison generation of that rule.
  expect((await reschedule()).error)
   .toMatchObject({code:"23P01",message:"SLOT_RESCHEDULE_PENDING_RULE_CONFLICT"});
  expect((await admin.from("lesson_slots").update({active:false}).eq("id",pending.id)).error)
   .toBeNull();
  expect((await receipts()).data).toEqual([]);
  expect((await exceptions()).data).toEqual([]);
  expect((await sessions()).data).toEqual(baseline.data);

  const preview=await reschedule();
  expect(preview.error).toBeNull();
  expect(preview.data).toMatchObject({
   slotId:source.id,seriesId:source.series_id,originalOccurrenceOn:original,timezone,
   originalStartsAt:expect.any(String),revisedStartsAt:expect.any(String),durationMinutes:45,
   reviewDigest:expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(Date.parse(preview.data.revisedStartsAt)).toBe(Date.parse(targetStarts));
  expect((await receipts()).data).toEqual([]);
  expect((await sessions()).data).toEqual(baseline.data);
  const commit={p_confirmed:true,p_review_digest:preview.data.reviewDigest,p_idempotency_key:randomUUID()};
  expect((await reschedule({...commit,p_revised_time:"16:20:00"})).error)
   .toMatchObject({code:"23505",message:"SLOT_RESCHEDULE_REVIEW_CONFLICT"});
  expect((await receipts()).data).toEqual([]);

  const [approved,replay]=await Promise.all([reschedule(commit),reschedule(commit)]);
  expect(approved.error).toBeNull();
  expect(replay.error).toBeNull();
  expect([approved.data.replayed,replay.data.replayed].sort()).toEqual([false,true]);
  const {replayed,...receipt}=approved.data;
  expect(replay.data).toEqual({...receipt,replayed:!replayed});
  expect((await reschedule({...commit,p_reason:"Different reschedule approval payload"})).error)
   .toMatchObject({code:"23505",message:"SLOT_RESCHEDULE_REPLAY_CONFLICT"});
  const stored=await sessions();
  expect(stored.error).toBeNull();
  expect(stored.data).toHaveLength(2);
  const moved=stored.data![0];
  expect(moved).toMatchObject({
   id:receipt.sessionId,slot_id:source.id,slot_occurrence_date:original,rescheduled_from_date:original,
   local_timezone:timezone,duration_minutes:45,is_home_visit:true,slot_rate_cents:12000,request_id:commit.p_idempotency_key,
  });
  expect(Date.parse(moved.starts_at)).toBe(Date.parse(targetStarts));
  expect(stored.data![1]).toEqual(baseline.data![0]);
  const frozen=await admin.from("session_participants").select("student_id").eq("session_id",moved.id);
  expect(frozen.error).toBeNull();
  expect(frozen.data).toEqual([{student_id:learner.data!.id}]);
  const e=await exceptions();
  expect(e.error).toBeNull();
  expect(e.data).toHaveLength(1);
  expect(e.data![0]).toMatchObject({
   id:receipt.exceptionId,slot_id:source.id,original_occurrence_on:original,action:"reschedule",
   revised_timezone:timezone,revised_duration_minutes:45,approved_by:owner.id,session_id:moved.id,
   request_id:commit.p_idempotency_key,reason:args.p_reason,revision:1,revoked_at:null,
  });
  expect(Date.parse(e.data![0].revised_starts_at)).toBe(Date.parse(targetStarts));
  const reMaterialize=await materialize([original,neighbor]);
  expect(reMaterialize.error).toBeNull();
  expect(reMaterialize.data).toEqual({planned:2,inserted:0});
  expect((await sessions()).data).toEqual(stored.data);
  expect((await admin.from("teaching_sessions").delete().eq("id",moved.id)).error?.code).toBe("23503");
  expect((await sessions()).data).toEqual(stored.data);
  const durable=await receipts();
  expect(durable.error).toBeNull();
  expect(durable.data).toEqual([{idempotency_key:commit.p_idempotency_key,receipt}]);
 }finally{
  expect((await admin.auth.admin.deleteUser(owner.id)).error).toBeNull();
  expect((await admin.auth.admin.deleteUser(outsider.id)).error).toBeNull();
 }
});

test("one-date rescheduling rejects nonexistent and ambiguous local starts",async()=>{
 const admin=db(process.env.SUPABASE_SERVICE_ROLE_KEY!);
 const owner=await teacher(admin);
 try{
  const workplace=await admin.from("workplaces").update({timezone:"America/New_York"})
   .eq("teacher_id",owner.id).eq("kind","personal").select("id").single();
  expect(workplace.error).toBeNull();
  const student=await admin.from("students").insert({
   teacher_id:owner.id,name:"Synthetic DST learner "+randomUUID(),
  }).select("id").single();
  expect(student.error).toBeNull();
  const enrolled=await admin.from("workplace_enrollments").insert({
   teacher_id:owner.id,student_id:student.data!.id,workplace_id:workplace.data!.id,source:"manual",
  });
  expect(enrolled.error).toBeNull();
  const original="2060-01-08";
  const slot=await admin.from("lesson_slots").insert({
   teacher_id:owner.id,student_id:student.data!.id,workplace_id:workplace.data!.id,
   start_date:original,day_of_week:dayOfWeek(original),start_time:"14:00:00",duration_minutes:45,
  }).select("id,updated_at").single();
  expect(slot.error).toBeNull();
  for(const [date,time] of [["2060-03-14","02:30:00"],["2060-11-07","01:30:00"]]){
   const moved=await owner.client.rpc("ccp_canonical_reschedule_unmaterialized_slot",{
    p_slot_id:slot.data!.id,p_original_occurrence_on:original,p_revised_date:date,p_revised_time:time,
    p_expected_updated_at:slot.data!.updated_at,p_reason:"Synthetic DST reschedule",
    p_review_digest:null,p_idempotency_key:null,p_confirmed:false,
   });
   expect(moved.error).toMatchObject({code:"22023",message:"SLOT_RESCHEDULE_AMBIGUOUS_LOCAL_TIME"});
  }
  for(const table of ["teaching_sessions","slot_occurrence_exceptions","agent_tool_receipts"]){
   const read=await admin.from(table).select("*").eq("teacher_id",owner.id);
   expect(read.error).toBeNull();
   expect(read.data).toEqual([]);
  }
 }finally{
  expect((await admin.auth.admin.deleteUser(owner.id)).error).toBeNull();
 }
});
