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

for(const action of ["this_and_future","entire_series"] as const){
 test(action+" edits linked segments atomically and preserves history and gaps",async()=>{
  const zone="UTC";
  const {admin,owner,id,scope}=await tenant(zone);
  try{
   const today=new Date().toISOString().slice(0,10);
   const d=(offset:number)=>new Date(Date.parse(today)+offset*86400000).toISOString().slice(0,10);
   const base={...scope,day_of_week:dayOfWeek(today),duration_minutes:45};
   const root=await admin.from("lesson_slots").insert({
    ...base,start_date:d(-7),end_date:d(14),start_time:"00:00",rate_cents:1200,
   }).select("*").single();
   expect(root.error).toBeNull();
   const rootId=root.data!.id,tailId=randomUUID();
   const later=await admin.from("lesson_slots").insert({
    ...base,series_id:rootId,start_date:d(28),end_date:d(42),start_time:"10:00",
    duration_minutes:60,rate_cents:2400,is_home_visit:true,
   }).select("*").single();
   expect(later.error).toBeNull();
   const laterId=later.data!.id, key=randomUUID();
   const occurrence=(slot_id:string,offset:number,time:string,duration_minutes:number,slot_rate_cents:number,is_home_visit=false)=>({
    ...scope,slot_id,slot_occurrence_date:d(offset),starts_at:zonedTimeToUtc(d(offset),time,zone).toISOString(),
    local_timezone:zone,duration_minutes,slot_rate_cents,is_home_visit,
   });
   const materialize=(p_rows:ReturnType<typeof occurrence>[])=>owner.rpc("ccp_canonical_slot_materialize",{p_rows});
   expect((await materialize([
    occurrence(rootId,0,"00:00",45,1200),occurrence(rootId,7,"00:00",45,1200),
    occurrence(rootId,14,"00:00",45,1200),occurrence(laterId,28,"10:00",60,2400,true),
   ])).error).toBeNull();
   expect((await admin.from("teaching_sessions").update({status:"completed",lesson_note:"Synthetic protected"})
     .eq("slot_id",rootId).eq("slot_occurrence_date",d(14))).error).toBeNull();
   expect((await admin.from("slot_occurrence_exceptions").insert({
    teacher_id:id,slot_id:laterId,original_occurrence_on:d(35),action:"cancel",approved_by:id,
    reason:"Synthetic reviewed cancellation",request_id:randomUUID(),
   })).error).toBeNull();
   const args={p_slot_id:action==="entire_series"?laterId:rootId,p_scope:action,
    p_cutoff:action==="entire_series"?null:d(14),p_tail_id:tailId,p_changes:{startTime:"11:15"},
    p_to:d(42),p_expected_updated_at:(action==="entire_series"?later:root).data!.updated_at,
    p_idempotency_key:key,p_review_digest:null,p_confirmed:false};
   const preview=()=>owner.rpc("ccp_canonical_slot_edit_scoped",args);
   const commit=(digest:string)=>owner.rpc("ccp_canonical_slot_edit_scoped",{...args,p_review_digest:digest,p_confirmed:true});
   const sessions=async()=>(await admin.from("teaching_sessions").select("*").eq("teacher_id",id).order("slot_occurrence_date").order("id")).data!;
   const slots=async()=>(await admin.from("lesson_slots").select("*").eq("teacher_id",id).order("id")).data!;
   const receipt=async()=>(await admin.from("agent_tool_receipts").select("receipt").eq("teacher_id",id).eq("idempotency_key",key).maybeSingle()).data;
   const first=await preview();
   expect(first.error).toBeNull();
   expect(first.data).toMatchObject({scope:action,affectedSegments:2,cutoff:d(action==="entire_series"?1:14),
    replaceableDrafts:action==="entire_series"?2:1,preservedHistory:1});
   expect(await receipt()).toBeNull();
   expect((await owner.rpc("ccp_canonical_slot_edit_scoped",{...args,p_to:d(21)})).error?.message)
    .toBe("RECURRENCE_SCOPE_REVIEW_RANGE_INCOMPLETE");
   expect((await owner.rpc("ccp_canonical_slot_edit_scoped",{...args,p_scope:"all"})).error?.message)
    .toBe("RECURRENCE_SCOPE_INVALID");
   expect((await owner.rpc("ccp_canonical_slot_edit_scoped",{...args,p_changes:{timezone:"Europe/Berlin"}})).error?.message)
    .toBe("RECURRENCE_SCOPE_UNSUPPORTED_FIELDS");

   // Change an affected rule other than the anchor, retaining supplied overrides.
   expect((await admin.from("lesson_slots").update({rate_cents:action==="entire_series"?1300:2500})
    .eq("id",action==="entire_series"?rootId:laterId)).error).toBeNull();
   expect((await commit(first.data.reviewDigest)).error?.message).toBe("RECURRENCE_SCOPE_REVIEW_CONFLICT");
   const reviewed=await preview();
   expect(reviewed.error).toBeNull();
   const blocker=await admin.from("lesson_slots").insert({
    ...base,start_date:d(28),end_date:d(28),start_time:"11:15",rate_cents:780,
   }).select("id").single();
   expect(blocker.error).toBeNull();
   const blockerId=blocker.data!.id;
   expect((await materialize([occurrence(blockerId,28,"11:15",45,780)])).error).toBeNull();
   const rowsBefore=await sessions(),slotsBefore=await slots();
   const rejected=await commit(reviewed.data.reviewDigest);
   expect(rejected.error?.message).toBe("SESSION_CONFLICT");
   expect(await slots()).toEqual(slotsBefore);
   expect(await sessions()).toEqual(rowsBefore);
   expect(await receipt()).toBeNull();
   expect((await owner.rpc("ccp_canonical_slot_delete",{p_slot_id:blockerId,p_idempotency_key:randomUUID()})).error).toBeNull();

   const independent=await admin.from("lesson_slots").insert({
    ...base,start_date:d(42),end_date:d(42),start_time:"13:15",rate_cents:810,
   }).select("*").single();
   expect(independent.error).toBeNull();
   expect((await materialize([occurrence(independent.data!.id,42,"13:15",45,810)])).error).toBeNull();
   const before=await sessions();
   const committed=await commit(reviewed.data.reviewDigest);
   expect(committed.error).toBeNull();
   const rules=await slots(), after=await sessions();
   const keep=before.filter(row=>row.slot_id===independent.data!.id||row.slot_occurrence_date===d(0)||
    row.slot_occurrence_date===d(14)||(action==="this_and_future"&&row.slot_occurrence_date===d(7)));
   expect(after.filter(row=>keep.some(k=>k.id===row.id))).toEqual(keep);
   expect(rules.find(row=>row.id===rootId)).toMatchObject({end_date:d(action==="entire_series"?0:13),start_time:"00:00:00"});
   expect(rules.find(row=>row.id===tailId)).toMatchObject({series_id:rootId,start_time:"11:15:00",duration_minutes:45,
    rate_cents:action==="entire_series"?1300:1200,end_date:d(14)});
   expect(rules.find(row=>row.id===laterId)).toMatchObject({start_time:"11:15:00",duration_minutes:60,is_home_visit:true,
    rate_cents:action==="entire_series"?2400:2500,start_date:d(28)});
   expect(rules.find(row=>row.id===independent.data!.id)).toEqual(independent.data);
   expect(after.filter(row=>row.slot_id===laterId).map(row=>row.slot_occurrence_date)).toEqual([d(28),d(42)]);
   expect(after.some(row=>row.slot_occurrence_date===d(21))).toBe(false);
   expect(after.filter(row=>row.slot_id===tailId).map(row=>row.slot_occurrence_date)).toEqual(action==="entire_series"?[d(7)]:[]);
   expect((await commit(reviewed.data.reviewDigest)).data).toEqual({...committed.data,replayed:true});
   expect((await owner.rpc("ccp_canonical_slot_edit_scoped",{
    ...args,p_changes:{rateCents:900},p_review_digest:reviewed.data.reviewDigest,p_confirmed:true,
   })).error?.message).toBe("RECURRENCE_SCOPE_REPLAY_CONFLICT");
   expect(await sessions()).toEqual(after);
  }finally{
   expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
 });
}

test("scoped edit refuses nonexistent and ambiguous local starts",async()=>{
 const {admin,owner,id,scope}=await tenant("Europe/Berlin");
 try{
  // This first slice bounds each review to a year from tomorrow or its explicit cutoff.
  const year=new Date().getUTCFullYear()+1;
  const transition=(month:number)=>{
   const date=new Date(Date.UTC(year,month,0));
   date.setUTCDate(date.getUTCDate()-date.getUTCDay());
   return date.toISOString().slice(0,10);
  };
  const root=await admin.from("lesson_slots").insert({
   ...scope,day_of_week:0,start_date:`${year}-01-01`,end_date:`${year}-11-01`,
   start_time:"10:30:00",duration_minutes:45,
  }).select("id,updated_at").single();
  expect(root.error).toBeNull();
  for(const date of [transition(3),transition(10)]){
   const result=await owner.rpc("ccp_canonical_slot_edit_scoped",{
    p_slot_id:root.data!.id,p_scope:"this_and_future",p_cutoff:date,p_tail_id:randomUUID(),
    p_changes:{startTime:"02:30"},p_to:date,p_expected_updated_at:root.data!.updated_at,
    p_review_digest:null,p_idempotency_key:null,p_confirmed:false,
   });
   expect(result.error?.message,date).toBe("RECURRENCE_SCOPE_AMBIGUOUS_LOCAL_TIME");
  }
  expect((await admin.from("lesson_slots").select("id").eq("teacher_id",id)).data).toHaveLength(1);
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});

function scheduleClock(){
 const now=Date.now();
 const offset=[0,-8,8].find(h=>{
  const hour=new Date(now+h*3600000).getUTCHours();
  return hour>=8&&hour<16;
 })!;
 const local=(advance:number)=>new Date(Date.now()+offset*3600000+advance);
 const zone=offset===0?"UTC":offset>0?`Etc/GMT-${offset}`:`Etc/GMT+${-offset}`;
 const today=local(0).toISOString().slice(0,10);
 const day=(n:number)=>new Date(Date.parse(today)+n*86400000).toISOString().slice(0,10);
 const time=(ms:number)=>local(ms).toISOString().slice(11,19);
 return {zone,today,day,time};
}

for(const action of ["this_and_future","entire_series"] as const){
 test(action+" includes a still-future occurrence today without accepting a proposed past start",async()=>{
  const {zone,today,day,time}=scheduleClock();
  const {admin,owner,id,scope}=await tenant(zone);
  try{
   const slot=await admin.from("lesson_slots").insert({
    ...scope,day_of_week:dayOfWeek(today),start_date:day(-7),end_date:day(7),
    start_time:time(3600000),duration_minutes:45,
   }).select("*").single();
   expect(slot.error).toBeNull();
   const root=slot.data!,tail=randomUUID();
   const initial=await owner.rpc("ccp_canonical_slot_materialize",{p_rows:[{
    ...scope,slot_id:root.id,slot_occurrence_date:today,starts_at:zonedTimeToUtc(today,root.start_time,zone).toISOString(),
    local_timezone:zone,duration_minutes:45,slot_rate_cents:null,is_home_visit:false,
   }]});
   expect(initial.error).toBeNull();
   const original=(await admin.from("teaching_sessions").select("*").eq("slot_id",root.id).single()).data!;
   const args={p_slot_id:root.id,p_scope:action,p_cutoff:action==="this_and_future"?today:null,
    p_tail_id:tail,p_changes:{startTime:time(7200000)},p_expected_updated_at:root.updated_at,p_to:day(7),
    p_idempotency_key:randomUUID(),p_review_digest:null,p_confirmed:false};
   const past=await owner.rpc("ccp_canonical_slot_edit_scoped",{...args,p_changes:{startTime:time(-3600000)}});
   expect(past.error?.message).toBe("RECURRENCE_SCOPE_PROPOSED_START_PASSED");
   expect((await admin.from("teaching_sessions").select("*").eq("id",original.id).single()).data).toEqual(original);
   const preview=await owner.rpc("ccp_canonical_slot_edit_scoped",args);
   expect(preview.error).toBeNull();
   expect(preview.data).toMatchObject({cutoff:today,replaceableDrafts:1});
   const confirm={...args,p_review_digest:preview.data.reviewDigest,p_confirmed:true};
   const commit=await owner.rpc("ccp_canonical_slot_edit_scoped",confirm);
   expect(commit.error).toBeNull();
   expect(commit.data).toMatchObject({replayed:false,removedFutureDrafts:1});
   const changed=await admin.from("teaching_sessions").select("id,starts_at").eq("slot_id",tail)
    .eq("slot_occurrence_date",today).single();
   expect(changed.error).toBeNull();
   expect(changed.data!.id).not.toBe(original.id);
   expect(new Date(changed.data!.starts_at).toISOString()).toBe(zonedTimeToUtc(today,args.p_changes.startTime,zone).toISOString());
   const retry=await owner.rpc("ccp_canonical_slot_edit_scoped",confirm);
   expect(retry.data).toEqual({...commit.data,replayed:true});
  }finally{
   expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
 });
}

test("same-day review expires at the original start and renewed entire-series edit leaves today untouched",async()=>{
 const {zone,today,day,time}=scheduleClock();
 const {admin,owner,id,scope}=await tenant(zone);
 try{
  const anchor=await admin.from("lesson_slots").insert({
   ...scope,day_of_week:dayOfWeek(today),start_date:day(-7),end_date:day(7),
   start_time:time(6500),duration_minutes:45,
  }).select("*").single();
  expect(anchor.error).toBeNull();
  const root=anchor.data!;
  const oldStart=zonedTimeToUtc(today,root.start_time,zone);
  expect((await owner.rpc("ccp_canonical_slot_materialize",{p_rows:[{
   ...scope,slot_id:root.id,slot_occurrence_date:today,starts_at:oldStart.toISOString(),
   local_timezone:zone,duration_minutes:45,slot_rate_cents:null,is_home_visit:false,
  }]})).error).toBeNull();
  const readToday=async()=>(await admin.from("teaching_sessions").select("*").eq("slot_id",root.id)
   .eq("slot_occurrence_date",today).single()).data;
  const original=await readToday();
  expect(original).not.toBeNull();
  const args={p_slot_id:root.id,p_scope:"entire_series",p_cutoff:null,
   p_tail_id:randomUUID(),p_changes:{startTime:time(3600000)},p_expected_updated_at:root.updated_at,p_to:day(7),
   p_idempotency_key:randomUUID(),p_review_digest:null,p_confirmed:false};
  const secondArgs={...args,p_scope:"this_and_future",p_cutoff:today,p_idempotency_key:randomUUID()};
  const [preview,secondPreview]=await Promise.all([owner.rpc("ccp_canonical_slot_edit_scoped",args),
   owner.rpc("ccp_canonical_slot_edit_scoped",secondArgs)]);
  expect(preview.error).toBeNull();
  expect(secondPreview.error).toBeNull();
  expect(preview.data.cutoff).toBe(today);
  expect(secondPreview.data.cutoff).toBe(today);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,oldStart.getTime()+400-Date.now())));
  for(const [request,digest] of [[args,preview.data.reviewDigest],[secondArgs,secondPreview.data.reviewDigest]] as const){
   const stale=await owner.rpc("ccp_canonical_slot_edit_scoped",{...request,p_review_digest:digest,p_confirmed:true});
   expect(stale.error?.message).toBe("RECURRENCE_SCOPE_REVIEW_CONFLICT");
   expect((await admin.from("agent_tool_receipts").select("idempotency_key").eq("teacher_id",id)
    .eq("idempotency_key",request.p_idempotency_key).maybeSingle()).data).toBeNull();
  }
  expect(await readToday()).toEqual(original);
  const renewed=await owner.rpc("ccp_canonical_slot_edit_scoped",args);
  expect(renewed.error).toBeNull();
  expect(renewed.data.cutoff).toBe(day(1));
  expect(renewed.data.reviewDigest).not.toBe(preview.data.reviewDigest);
  const result=await owner.rpc("ccp_canonical_slot_edit_scoped",{
   ...args,p_review_digest:renewed.data.reviewDigest,p_confirmed:true,
  });
  expect(result.error).toBeNull();
  expect(await readToday()).toEqual(original);
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
