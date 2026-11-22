import {createHash,randomBytes,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

/** Cancellation windows determine make-up eligibility, not charges or posted finance. */
test("PARITY: workplace cancellation uses typed inherited or explicit terms and preserves the original decision",async({page,request})=>{
 test.setTimeout(90_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
 const client=()=>createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 const owner=client(),foreign=client(),teacherIds:string[]=[];
 const provision=async(viewer:ReturnType<typeof client>)=>{
  const email="cancellation-"+randomUUID()+"@example.invalid",password="SyntheticCancelWindow-123!";
  const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  const id=identity.data.user!.id;
  teacherIds.push(id);
  expect((await admin.from("teachers").insert({
   id,email,display_name:"Synthetic cancellation coach",onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  const auth=await viewer.auth.signInWithPassword({email,password});
  expect(auth.error).toBeNull();
  return {id,email,password,bearer:auth.data.session!.access_token};
 };
 const insert=async(table:string,row:Record<string,unknown>)=>{
  const result=await admin.from(table).insert(row).select("id").single();
  expect(result.error,table).toBeNull();
  return result.data!.id as string;
 };
 const makeToken=()=>randomBytes(32).toString("base64url");
 const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
 try{
  const coach=await provision(owner), outsider=await provision(foreign);
  const teacher_id=coach.id;
  const call=await delegatedTool(page,request,"coach:read coach:write",coach);
  const global=async(hours:number,timely:boolean,late:boolean)=>{
   const result=await admin.from("teacher_settings").upsert({
    teacher_id,cancellation_window_hours:hours,timely_cancel_earns_makeup:timely,
    late_cancel_earns_makeup:late,makeup_credit_expiry_days:null,
   },{onConflict:"teacher_id"});
   expect(result.error).toBeNull();
  };
  await global(24,true,false);
  const personal=await admin.from("workplaces").select("id").eq("teacher_id",teacher_id).eq("kind","personal").single();
  expect(personal.error).toBeNull();
  const personalId=personal.data!.id,schoolId=await insert("workplaces",{
   teacher_id,name:"Synthetic cancellation school",kind:"professional",timezone:"UTC",currency:"USD",locale:"en",
   policy:{cancellationWindowHours:7},
  });
  const studentId=await insert("students",{teacher_id,name:"Synthetic cancellation learner"});
  for(const workplace_id of [personalId,schoolId])
   await insert("workplace_enrollments",{teacher_id,student_id:studentId,workplace_id,source:"manual",starts_on:"2020-01-01"});
  const readWorkplace=async(id:string)=>{
   const row=await owner.from("workplaces").select("cancellation_window_hours,updated_at").eq("id",id).single();
   expect(row.error).toBeNull();
   return row.data!;
  };
  const patch=(id:string,revision:string,hours:number|null)=>({
   workplaceId:id,expectedUpdatedAt:revision,cancellationWindowHours:hours,idempotencyKey:randomUUID(),
  });
  const fromSite=await page.request.post("/api/agent/v1",{data:{
   action:"workplaces.update",...patch(schoolId,(await readWorkplace(schoolId)).updated_at,48),
  }});
  expect(fromSite.status(),await fromSite.text()).toBe(200);
  expect((await readWorkplace(schoolId)).cancellation_window_hours).toBe(48);
  expect((await readWorkplace(personalId)).cancellation_window_hours).toBeNull();
  const denied=await page.request.post("/api/agent/v1",{
   headers:{Authorization:"Bearer "+outsider.bearer},data:{
    action:"workplaces.update",...patch(schoolId,(await readWorkplace(schoolId)).updated_at,99),
   },
  });
  expect([404,409]).toContain(denied.status());
  expect((await readWorkplace(schoolId)).cancellation_window_hours).toBe(48);
  const setPersonal=async(hours:number|null)=>{
   const result=await call("ccp_workplaces_update",patch(personalId,(await readWorkplace(personalId)).updated_at,hours));
   expect(result.error).toBeUndefined();
   expect((await readWorkplace(personalId)).cancellation_window_hours).toBe(hours);
  };
  const createLesson=async(workplaceId:string,startsAt:string,title:string)=>{
   const result=await call("ccp_sessions_create",{
    workplaceId,studentId,startsAt,title,durationMinutes:45,lessonNote:"",idempotencyKey:randomUUID(),
   });
   expect(result.error).toBeUndefined();
   const id=result.data.entityId as string;
   const row=await owner.from("teaching_sessions").select("id,starts_at,updated_at").eq("id",id).single();
   expect(row.error).toBeNull();
   return row.data!;
  };
  const at=(days:number,hour=13)=>new Date(new Date().setUTCHours(hour,0,0,0)+days*86400000).toISOString();
  const equal=await createLesson(schoolId,at(8),"Meeting exact cancellation threshold");
  const late=await createLesson(schoolId,at(9),"Meeting late cancellation threshold");
  const inherited=await createLesson(personalId,at(10),"Private inherited threshold");
  const guest=await createLesson(schoolId,at(5),"Guest cancellation threshold");
  const mark=async(session:{id:string;starts_at:string},advanceHours:number,extraMs=0)=>{
   const noticeAt=new Date(Date.parse(session.starts_at)-advanceHours*3600000+extraMs).toISOString();
   const result=await owner.rpc("ccp_teacher_session_commit",{
    p_session_id:session.id,p_changes:{},p_expected_updated_at:null,p_idempotency_key:randomUUID(),
    p_attendance:[{studentId,status:"student_cancelled",noticeAt,expectedUpdatedAt:null}],
   });
   expect(result.error).toBeNull();
  };
  await mark(equal,48);
  await mark(late,48,1);
  await mark(inherited,24);
  await setPersonal(0);
  const zero=await createLesson(personalId,at(11),"An explicitly zero-hour threshold");
  await mark(zero,0);
  await setPersonal(null);
  const contact_id=await insert("contacts",{teacher_id,display_name:"Synthetic cancellation contact",preferred_locale:"en"});
  await insert("student_contacts",{teacher_id,student_id:studentId,contact_id,relationship_label:"Recipient"});
  const token=makeToken();
  await insert("portal_access_grants",{
   teacher_id,student_id:studentId,contact_id,workplace_id:schoolId,permissions:["calendar","cancel"],
   token_digest:digest(token),issued_at:new Date().toISOString(),expires_at:at(14),
  });
  await page.goto("/portal/"+token);
  await expect(page.getByRole("heading",{name:/Synthetic cancellation contact/})).toBeVisible();
  await expect(page.getByText("Guest cancellation threshold",{exact:true})).toHaveCount(0);
  const guestControl=page.getByRole("button",{name:"Cancel lesson"});
  await expect(guestControl).toHaveCount(1);
  await guestControl.click();
  await expect(page.getByText(/48 hours/)).toBeVisible();
  const cancelUrl=(sessionId:string)=>"/api/portal/"+token+"/sessions/"+sessionId+"/students/"+studentId+"/cancel";
  expect((await request.post(cancelUrl(inherited.id),{data:{note:"Wrong venue"}})).status()).toBe(404);
  const cancel=await request.post(cancelUrl(guest.id),{data:{note:"Approved guest notice"}});
  expect(cancel.status(),await cancel.text()).toBe(200);
  const cancelled=await cancel.json();
  const replay=await request.post(cancelUrl(guest.id),{data:{note:"Ignored replay note"}});
  expect(replay.status(),await replay.text()).toBe(200);
  expect(await replay.json()).toMatchObject({replayed:true,noticeAt:cancelled.noticeAt});

  const snapshot=async(id:string)=>{
   const result=await owner.from("session_attendance").select("*").eq("session_id",id).eq("student_id",studentId).single();
   expect(result.error).toBeNull();
   return result.data!;
  };
  const readTerms=(row:Awaited<ReturnType<typeof snapshot>>)=>{
   const fields=row as unknown as Record<string,unknown>;
   return {
    windowHours:fields.cancellation_window_hours_snapshot,
    timely:fields.cancellation_timely_earns_makeup_snapshot,
    late:fields.cancellation_late_earns_makeup_snapshot,
    startsAt:new Date(String(fields.cancellation_session_starts_at_snapshot)).toISOString(),
    origin:fields.cancellation_policy_snapshot_origin,
    wasTimely:fields.cancellation_was_timely_snapshot,
   };
  };
  for(const [lesson,hours] of [[equal,48],[late,48],[inherited,24],[zero,0],[guest,48]] as const){
   expect(readTerms(await snapshot(lesson.id))).toEqual({
    windowHours:hours,timely:true,late:false,startsAt:new Date(lesson.starts_at).toISOString(),
    origin:"observed",wasTimely:lesson.id!==late.id,
   });
  }
  const existing=await snapshot(equal.id);
  await global(72,false,false);
  const changed=await call("ccp_workplaces_update",patch(schoolId,(await readWorkplace(schoolId)).updated_at,96));
  expect(changed.error).toBeUndefined();
  expect(await snapshot(equal.id)).toEqual(existing);
  const changedSnapshot=await admin.from("session_attendance").update({cancellation_window_hours_snapshot:72})
   .eq("id",existing.id);
  expect(changedSnapshot.error?.code).toBe("42501");
  const preserved=await snapshot(equal.id);
  expect(readTerms(preserved)).toEqual(readTerms(existing));
  const corrected=await owner.rpc("ccp_teacher_session_commit",{
   p_session_id:equal.id,p_changes:{},p_expected_updated_at:null,p_idempotency_key:randomUUID(),
   p_attendance:[{studentId,status:"student_cancelled",noticeAt:existing.notice_at,
    expectedUpdatedAt:preserved.updated_at,note:"Reviewed note correction"}],
  });
  expect(corrected.error).toBeNull();
  expect(readTerms(await snapshot(equal.id))).toEqual(readTerms(existing));
  expect((await snapshot(guest.id)).cancel_reason).toBe("Approved guest notice");
  const after=await createLesson(schoolId,at(12),"Cancellation after the policy changed");
  await mark(after,96);
  expect(readTerms(await snapshot(after.id))).toMatchObject({windowHours:96,timely:false,late:false});

  // The imported snapshot is testimony from an unverified backup, not
  // permission to redeem a new make-up lesson.
  const restored=await createLesson(schoolId,at(13),"Unverified restored cancellation");
  const restoreRow={
   id:randomUUID(),teacher_id,session_id:restored.id,student_id:studentId,status:"student_cancelled",
   notice_at:new Date(Date.parse(restored.starts_at)-48*3600000).toISOString(),cancelled_by:"student",
   cancellation_window_hours_snapshot:48,cancellation_session_starts_at_snapshot:restored.starts_at,
   cancellation_timely_earns_makeup_snapshot:true,cancellation_late_earns_makeup_snapshot:false,
   cancellation_policy_snapshot_origin:"observed",cancellation_was_timely_snapshot:true,
  };
  const restoreTables={session_attendance:[restoreRow]};
  const restoration=await owner.rpc("ccp_teacher_backup_restore",{
   p_tables:restoreTables,p_display_name:null,p_digest:digest(JSON.stringify(restoreTables)),
  });
  expect(restoration.error).toBeNull();
  expect(readTerms(await snapshot(restored.id))).toMatchObject({
   windowHours:48,timely:true,late:false,origin:"restored_unverified",
  });

  const creditRead=await page.request.get("/api/coaching/calendar/makeup-credits");
  expect(creditRead.status(),await creditRead.text()).toBe(200);
  const site=(await creditRead.json()).credits;
  const mcp=await call("ccp_canonical_makeup_credits_list",{});
  expect(mcp.error).toBeUndefined();
  expect(mcp.data.credits).toEqual(site);
  const ids=site.map((row:{sourceSessionId:string})=>row.sourceSessionId);
  expect(ids.sort()).toEqual([equal.id,inherited.id,zero.id,guest.id].sort());
  const redeem=(source:string,day:string)=>({
   studentId,workplaceId:schoolId,date:day,time:"10:00",isHomeVisit:false,
   makeupForSessionId:source,idempotencyKey:randomUUID(),confirmed:true,
  });
  const valid=redeem(equal.id,"2082-08-18");
  const created=await call("ccp_private_sessions_create",valid);
  expect(created.error).toBeUndefined();
  expect(created.data).toMatchObject({makeup_for_session_id:equal.id,replayed:false});
  const again=await call("ccp_private_sessions_create",valid);
  expect(again.error).toBeUndefined();
  expect(again.data).toMatchObject({id:created.data.id,replayed:true});
  expect((await call("ccp_private_sessions_create",redeem(equal.id,"2082-08-19"))).error).toBeDefined();
  expect((await call("ccp_private_sessions_create",redeem(late.id,"2082-08-20"))).error).toBeDefined();
  expect((await call("ccp_private_sessions_create",redeem(restored.id,"2082-08-21"))).error).toBeDefined();
 }finally{
  for(const id of teacherIds.reverse())expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
