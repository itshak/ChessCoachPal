import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {dayOfWeek,zonedTimeToUtc} from "../lib/schedule";

async function tenant(zone:string){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const owner=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email="scoped-slot-"+randomUUID()+"@example.invalid",password="SyntheticTerminal-123!";
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

async function weekdayFixture(){
 const zone="UTC";
 const {admin,owner,id,scope}=await tenant(zone);
 const today=new Date().toISOString().slice(0,10);
 const date=(n:number)=>new Date(Date.parse(today)+n*86400000).toISOString().slice(0,10);
 const oldDow=dayOfWeek(date(10)),weekday=(oldDow+2)%7;
 const setup={...scope,day_of_week:oldDow,duration_minutes:45,start_time:"09:00",rate_cents:1900};
 const initial=await admin.from("lesson_slots").insert({...setup,start_date:date(10),end_date:date(34)}).select("*").single();
 expect(initial.error).toBeNull();
 const root=initial.data!;
 const sibling=await admin.from("lesson_slots").insert({...setup,series_id:root.id,start_date:date(45),end_date:date(64),
  start_time:"10:00",duration_minutes:60,rate_cents:2200,is_home_visit:true}).select("*").single();
 expect(sibling.error).toBeNull();
 const later=sibling.data!;
 const materialize=(rows:{slot:typeof root,offset:number}[])=>owner.rpc("ccp_canonical_slot_materialize",{
  p_rows:rows.map(({slot,offset})=>({
   ...scope,slot_id:slot.id,slot_occurrence_date:date(offset),
   starts_at:zonedTimeToUtc(date(offset),slot.start_time,zone).toISOString(),local_timezone:zone,
   duration_minutes:slot.duration_minutes,slot_rate_cents:slot.rate_cents,is_home_visit:slot.is_home_visit,
  })),
 });
 expect((await materialize([{slot:root,offset:10},{slot:root,offset:24},{slot:later,offset:52}])).error).toBeNull();
 expect((await admin.from("teaching_sessions").update({status:"completed",lesson_note:"Protected prior original"})
  .eq("slot_id",root.id).eq("slot_occurrence_date",date(10))).error).toBeNull();
 const tail=randomUUID(),key=randomUUID();
 const args={p_slot_id:root.id,p_scope:"this_and_future",p_cutoff:date(17),p_tail_id:tail,
  p_changes:{dayOfWeek:weekday},p_to:date(65),p_expected_updated_at:root.updated_at,
  p_review_digest:null,p_idempotency_key:key,p_confirmed:false};
 const preview=()=>owner.rpc("ccp_canonical_slot_edit_scoped",args);
 const commit=(digest:string)=>owner.rpc("ccp_canonical_slot_edit_scoped",{...args,p_review_digest:digest,p_confirmed:true});
 const sessions=async()=>(await admin.from("teaching_sessions").select("*").eq("teacher_id",id).order("slot_occurrence_date")).data!;
 const rules=async()=>(await admin.from("lesson_slots").select("*").eq("teacher_id",id).order("id")).data!;
 const receipt=async()=>(await admin.from("agent_tool_receipts").select("receipt").eq("teacher_id",id).eq("idempotency_key",key).maybeSingle()).data;
 return {zone,admin,owner,id,scope,date,setup,root,later,tail,args,preview,commit,sessions,rules,receipt,materialize,weekday};
}
test("reviewed prospective weekday change reports explicit old/new dates and replaces only pristine suffix drafts",async()=>{
 const {admin,owner,id,scope,date,setup,root,later,tail,args,preview,commit,sessions,rules,receipt,materialize,weekday}=await weekdayFixture();
 try{
  const old=await sessions();
  const horizon=await owner.rpc("ccp_canonical_slot_edit_scoped",{...args,p_to:date(60)});
  expect(horizon.error?.message).toBe("RECURRENCE_SCOPE_WEEKDAY_COMPLETE_FINITE_RANGE_REQUIRED");
  const reviewed=await preview();
  expect(reviewed.error).toBeNull();
  expect(reviewed.data).toMatchObject({replaceableDrafts:2,affectedSegments:2,weekdayDateChanges:[
   {sourceSlotId:root.id,targetSlotId:tail,oldOriginalDates:[17,24,31].map(date),newOriginalDates:[19,26,33].map(date)},
   {sourceSlotId:later.id,targetSlotId:later.id,oldOriginalDates:[45,52,59].map(date),newOriginalDates:[47,54,61].map(date)},
  ]});
  expect(await sessions()).toEqual(old);
  expect(await receipt()).toBeNull();
  // Alter a later segment revision without changing the supplied weekday.
  expect((await admin.from("lesson_slots").update({end_date:date(65)}).eq("id",later.id)).error).toBeNull();
  expect((await commit(reviewed.data.reviewDigest)).error?.message).toBe("RECURRENCE_SCOPE_REVIEW_CONFLICT");
  const fresh=await preview();
  expect(fresh.error).toBeNull();
  const independent=await admin.from("lesson_slots").insert({
   ...scope,day_of_week:weekday,start_date:date(47),end_date:date(47),start_time:"10:00",
   duration_minutes:60,rate_cents:800,is_home_visit:true,
  }).select("*").single();
  expect(independent.error).toBeNull();
  expect((await materialize([{slot:independent.data!,offset:47}])).error).toBeNull();
  const before=await rules(),beforeSessions=await sessions();
  expect((await commit(fresh.data.reviewDigest)).error?.message).toBe("SESSION_CONFLICT");
  expect(await rules()).toEqual(before);
  expect(await sessions()).toEqual(beforeSessions);
  expect(await receipt()).toBeNull();
  expect((await owner.rpc("ccp_canonical_slot_delete",{p_slot_id:independent.data!.id,p_idempotency_key:randomUUID()})).error).toBeNull();
  const other=await admin.from("lesson_slots").insert({...setup,start_date:date(17),end_date:date(17),
   start_time:"12:00"}).select("*").single();
  expect(other.error).toBeNull();
  expect((await materialize([{slot:other.data!,offset:17}])).error).toBeNull();
  const independentBefore=(await sessions()).find(row=>row.slot_id===other.data!.id);
  const saved=await commit(fresh.data.reviewDigest);
  expect(saved.error).toBeNull();
  expect(saved.data).toMatchObject({removedFutureDrafts:2,materialized:{planned:6,inserted:6}});
  const actual=await sessions();
  expect(actual.find(row=>row.slot_id===root.id)).toEqual(old.find(row=>row.slot_id===root.id&&row.slot_occurrence_date===date(10)));
  expect(actual.find(row=>row.slot_id===other.data!.id)).toEqual(independentBefore);
  expect(actual.filter(row=>row.slot_id===tail).map(row=>row.slot_occurrence_date)).toEqual([19,26,33].map(date));
  expect(actual.filter(row=>row.slot_id===later.id).map(row=>row.slot_occurrence_date)).toEqual([47,54,61].map(date));
  expect(actual.some(row=>row.slot_occurrence_date>date(34)&&row.slot_occurrence_date<date(45))).toBe(false);
  const finalRules=await rules();
  expect(finalRules.find(rule=>rule.id===root.id)).toMatchObject({day_of_week:root.day_of_week,end_date:date(16)});
  expect(finalRules.find(rule=>rule.id===tail)).toMatchObject({day_of_week:weekday,start_date:date(17),end_date:date(34),rate_cents:1900});
  expect(finalRules.find(rule=>rule.id===later.id)).toMatchObject({day_of_week:weekday,rate_cents:2200,end_date:date(65),
   duration_minutes:60,is_home_visit:true,start_time:"10:00:00",start_date:date(45)});
  expect((await commit(fresh.data.reviewDigest)).data).toEqual({...saved.data,replayed:true});
  expect((await owner.rpc("ccp_canonical_slot_edit_scoped",{...args,p_changes:{dayOfWeek:(weekday+1)%7},
    p_confirmed:true,p_review_digest:fresh.data.reviewDigest})).error?.message).toBe("RECURRENCE_SCOPE_REPLAY_CONFLICT");
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});

for(const evidence of ["approved exception","evidenced draft","noncanonical frozen roster"] as const){
 test("weekday rewrite refuses "+evidence+" on the original date without writes",async()=>{
  const {admin,owner,id,date,later,args,commit,sessions,rules,receipt}=await weekdayFixture();
  try{
   const entire={...args,p_scope:"entire_series",p_cutoff:null,p_tail_id:null};
   // Entire-scope includes the currently protected early lesson, so use an explicit prior preview
   // of its date mapping before narrowing the proof to the earlier-scope suffix.
   expect((await owner.rpc("ccp_canonical_slot_edit_scoped",entire)).error?.message)
    .toBe("RECURRENCE_SCOPE_WEEKDAY_ORIGINAL_EVIDENCE");
   const initial=await owner.rpc("ccp_canonical_slot_edit_scoped",args);
   expect(initial.error).toBeNull();
   if(evidence==="approved exception"){
    const cancelled=await owner.rpc("ccp_canonical_slot_cancel_unmaterialized",{
     p_slot_id:later.id,p_original_occurrence_on:date(59),p_expected_updated_at:later.updated_at,
     p_idempotency_key:randomUUID(),p_reason:"Synthetic approval",p_confirmed:true,
    });
    expect(cancelled.error).toBeNull();
   }else if(evidence==="noncanonical frozen roster"){
    const imported=await admin.from("students").insert({teacher_id:id,name:"Synthetic second participant"}).select("id").single();
    expect(imported.error).toBeNull();
    const draft=(await sessions()).find(row=>row.slot_id===later.id&&row.slot_occurrence_date===date(52))!;
    expect((await admin.from("session_participants").insert({teacher_id:id,session_id:draft.id,student_id:imported.data!.id})).error).toBeNull();
   }else{
    expect((await admin.from("teaching_sessions").update({lesson_note:"Protected note after review"})
     .eq("slot_id",later.id).eq("slot_occurrence_date",date(52))).error).toBeNull();
   }
   const before=await rules(),beforeRows=await sessions();
   expect((await commit(initial.data.reviewDigest)).error?.message).toBe("RECURRENCE_SCOPE_WEEKDAY_ORIGINAL_EVIDENCE");
   expect(await rules()).toEqual(before);
   expect(await sessions()).toEqual(beforeRows);
   expect(await receipt()).toBeNull();
  }finally{
   expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
 });
}

test("weekday changes reject invalid target local times before writing any rule",async()=>{
 const {admin,owner,id,scope}=await tenant("Europe/Berlin");
 try{
  const year=new Date().getUTCFullYear()+1;
  for(const month of [3,10]){
   const sunday=new Date(Date.UTC(year,month,0));
   sunday.setUTCDate(sunday.getUTCDate()-sunday.getUTCDay());
   const target=sunday.toISOString().slice(0,10);
   sunday.setUTCDate(sunday.getUTCDate()-1);
   const original=sunday.toISOString().slice(0,10);
   const slot=await admin.from("lesson_slots").insert({
    ...scope,start_date:original,end_date:target,day_of_week:6,start_time:"02:30",duration_minutes:45,
   }).select("*").single();
   expect(slot.error).toBeNull();
   const result=await owner.rpc("ccp_canonical_slot_edit_scoped",{
    p_slot_id:slot.data!.id,p_scope:"this_and_future",p_cutoff:original,p_tail_id:null,
    p_changes:{dayOfWeek:0},p_to:target,p_expected_updated_at:slot.data!.updated_at,
    p_idempotency_key:null,p_review_digest:null,p_confirmed:false,
   });
   expect(result.error?.message,target).toBe("RECURRENCE_SCOPE_AMBIGUOUS_LOCAL_TIME");
   expect((await admin.from("lesson_slots").select("*").eq("id",slot.data!.id).single()).data).toEqual(slot.data);
  }
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
