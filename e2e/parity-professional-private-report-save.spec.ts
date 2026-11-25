import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-professional-private-report-save binds exact reviewed sources and reopens one private snapshot",async({page,request,browser})=>{
 test.setTimeout(180_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const users:string[]=[];
 const password="SyntheticPrivateReport9!";
 async function tenant(){
  const email="private-seal-"+randomUUID()+"@example.invalid";
  const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  const id=identity.data.user!.id;
  users.push(id);
  expect((await admin.from("teachers").insert({id,email,display_name:"Private report fixture",
   preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,id,8,4);
  return {id,email};
 }
 async function row(table:string,value:Record<string,unknown>){
  const r=await admin.from(table).insert(value).select("id").single();
  expect(r.error,table).toBeNull();
  return r.data!.id as string;
 }
 try{
  const owner=await tenant(),foreign=await tenant(),teacher_id=owner.id;
  const studentId=await row("students",{teacher_id,name:"Synthetic sealed learner"});
  const another=await row("students",{teacher_id,name:"Excluded other learner"});
  const workplaceId=await row("workplaces",{teacher_id,name:"Synthetic private school",timezone:"Asia/Jerusalem",
    locale:"en",currency:"ILS",kind:"professional",policy:{}});
  const from=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  const enroll=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  expect((await admin.from("workplace_enrollments").insert([studentId,another].map(student_id=>({
   teacher_id,workplace_id:workplaceId,student_id,starts_on:enroll,source:"manual",
  })))).error).toBeNull();
  const call=await delegatedTool(page,request,undefined,{email:owner.email,password});
  const baseURL=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;
  const privateRoute=(learner=studentId)=>"/api/students/"+learner+"/private-reports";
  const args={studentId,workplaceId,from,to:from,outputLocale:"he"};
  const publicFields={workplaceId,from,to:from,outputLocale:"he"};
  const modes=(mode:string,parameters:Record<string,string>={})=>privateRoute()+"?"+
    new URLSearchParams({mode,...parameters});
  const tools={
   review:"ccp_private_learner_report_review",save:"ccp_private_learner_report_save",
   list:"ccp_private_learner_reports_list",get:"ccp_private_learner_report_get",
  };
  const act=["present","excused"] as const;
  const sessions:string[]=[];
  for(let i=0;i<2;i++){
   const sessionId=await row("teaching_sessions",{teacher_id,workplace_id:workplaceId,roster_mode:"ad_hoc",
    local_timezone:"Asia/Jerusalem",starts_at:from+"T"+(10+i)+":00:00Z",duration_minutes:30,
    title:"Excluded school lesson title",lesson_note:"Private coach lesson note",request_id:randomUUID()});
   sessions.push(sessionId);
   expect((await admin.from("session_participants").insert([studentId,another].map(student_id=>({
    teacher_id,session_id:sessionId,student_id,
   })))).error).toBeNull();
   const roster=await call("ccp_sessions_roster_preview",{sessionId});
   expect(roster.error).toBeUndefined();
   expect((await call("ccp_sessions_complete",{sessionId,expectedUpdatedAt:roster.data.updatedAt,confirmed:true,
    attendance:[{studentId,status:act[i],expectedUpdatedAt:null,note:"Private attendance explanation"},
     {studentId:another,status:"late",expectedUpdatedAt:null,note:"Private other learner evidence"}],
    idempotencyKey:randomUUID()})).error).toBeUndefined();
  }
  async function correct(sessionId:string,status:string){
   const {data,error}=await admin.from("session_attendance").select("updated_at")
    .eq("session_id",sessionId).eq("student_id",studentId).single();
   expect(error).toBeNull();
   expect((await call("ccp_attendance_record",{sessionId,studentId,status,
    note:"Private corrected explanation",expectedUpdatedAt:data!.updated_at,
    idempotencyKey:randomUUID()})).error).toBeUndefined();
  }
  async function publications(){
   const result=await admin.from("report_publications").select("id,request_id,snapshot_digest").eq("teacher_id",teacher_id);
   expect(result.error).toBeNull();
   return result.data!;
  }
  async function unaffected(){
   const tables=["report_publication_audiences","portal_access_grants","financial_obligations","received_payments","payment_allocations"];
   const rows=await Promise.all(tables.map(table=>admin.from(table).select("*").eq("teacher_id",teacher_id)));
   for(const r of rows)expect(r.error).toBeNull();
   return rows.map(r=>r.data!.map(x=>JSON.stringify(x)).sort());
  }
  const unaffectedBefore=await unaffected();
  const old=await call(tools.review,args);
  expect(old.error).toBeUndefined();
  expect(old.data).toEqual({status:"teacher_preview_only",writesPerformed:false,reviewDigest:expect.stringMatching(/^[a-f0-9]{64}$/),
   candidate:{from,to:from,outputLocale:"he",dateBasis:"recorded_session_local_date",records:[
    {localDate:from,attendance:"excused"},{localDate:from,attendance:"present"},
   ]}});
  expect((await page.request.get(modes("review",publicFields))).status()).toBe(200);
  expect(await (await page.request.get(modes("review",publicFields))).json()).toEqual(old.data);
  const body={...publicFields,reviewDigest:old.data.reviewDigest,requestId:randomUUID(),confirmed:true};
  const headers={origin:baseURL};
  expect((await page.request.post(privateRoute(),{data:body})).status()).toBe(403);
  const unentitled=await page.request.post(privateRoute(),{headers,data:body});
  expect(unentitled.status(),await unentitled.text()).toBe(403);
  expect(await unentitled.json()).toMatchObject({code:"UPGRADE_REQUIRED"});
  expect(await publications()).toEqual([]);
  expect((await admin.from("teacher_entitlement_grants").insert({teacher_id,kind:"capability_boost",
   capability_key:"reports.publish",capability_kind:"boolean",boolean_value:true,reason:"Synthetic save fixture",
   request_id:randomUUID()})).error).toBeNull();
  const unsigned=await page.request.post(privateRoute(),{headers,data:{...body,confirmed:false}});
  expect(unsigned.status()).toBe(400);

  await page.setViewportSize({width:320,height:820});
  await page.goto("/students/"+studentId);
  await page.getByText("Learner report preview",{exact:true}).click();
  const panel=page.locator("details").filter({hasText:"Learner report preview"});
  await expect(panel.getByLabel("Workplace")).toBeEnabled();
  await panel.getByLabel("Workplace").selectOption(workplaceId);
  await panel.getByLabel("From date").fill(from);
  await panel.getByLabel("Through date").fill(from);
  await panel.getByLabel("Output language").selectOption("he");
  await panel.getByRole("button",{name:"Preview report",exact:true}).click();
  await panel.getByRole("button",{name:"Review before saving"}).click();
  await expect(panel.getByText("Check this exact version before saving it privately. No one else gets access.")).toBeVisible();
  await correct(sessions[0],"excused");
  await correct(sessions[1],"present");
  const now=await call(tools.review,args);
  expect(now.error).toBeUndefined();
  expect(now.data.candidate).toEqual(old.data.candidate);
  expect(now.data.reviewDigest).not.toBe(old.data.reviewDigest);
  await panel.getByRole("button",{name:"Save private report",exact:true}).click();
  await expect(panel.getByRole("alert")).toHaveText("The report evidence changed. Review it again before saving.");
  expect(await publications()).toEqual([]);
  await panel.getByRole("button",{name:"Review before saving"}).click();
  await expect(panel.getByRole("button",{name:"Save private report",exact:true})).toBeVisible();

  const attempted:Record<string,unknown>[]=[];
  const fullRoute=baseURL+privateRoute();
  // Keep interception enabled through the reload. Toggling Chromium's
  // interception after the intentionally dropped response can reset its
  // network state for the next real read. Only these exact POSTs are mocked.
  await page.route(fullRoute,async route=>{
    const req=route.request();
    if(req.method()!=="POST"){await route.continue();return;}
    attempted.push(req.postDataJSON());
    const reply=await route.fetch();
    expect(reply.status(),await reply.text()).toBe(200);
    if(attempted.length===1)await route.abort();
    else await route.fulfill({response:reply});
  });
  await panel.getByRole("button",{name:"Save private report",exact:true}).click();
  await expect(panel.getByRole("alert")).toContainText("could not confirm the save");
  await expect(panel.getByLabel("Workplace")).toBeDisabled();
  await panel.getByRole("button",{name:"Retry the same save"}).click();
  await expect(panel.getByText("Private report saved. It was not shared.")).toBeVisible();
  expect(attempted).toHaveLength(2);
  expect(attempted[1]).toEqual(attempted[0]);
  expect(attempted[0]).toMatchObject({...publicFields,reviewDigest:now.data.reviewDigest,confirmed:true});
  const durable=await publications();
  expect(durable).toHaveLength(1);
  expect(durable[0].request_id).toBe(attempted[0].requestId);
  const publicationId=durable[0].id as string;
  const exact=await call(tools.save,{studentId,...attempted[0]});
  expect(exact.error).toBeUndefined();
  expect(exact.data).toMatchObject({publicationId,receiptType:"teacher_private_seal",snapshotDigest:durable[0].snapshot_digest});
  await correct(sessions[0],"late");
  const latest=await call(tools.review,args);
  expect(latest.data.candidate).not.toEqual(now.data.candidate);
  const saved=await call(tools.get,{studentId,publicationId});
  expect(saved.error).toBeUndefined();
  expect(saved.data).toEqual({publicationId,snapshotDigest:exact.data.snapshotDigest,status:"sealed",revision:"1",
    candidate:now.data.candidate});
  const serialized=JSON.stringify(saved.data);
  for(const value of [studentId,another,...sessions,"Private","Excluded","evidence","reviewDigest"])
   expect(serialized).not.toContain(value);
  expect(await (await page.request.get(modes("get",{publicationId}))).json()).toEqual(saved.data);
  expect((await page.request.get(privateRoute(another)+"?mode=get&publicationId="+publicationId)).status()).toBe(404);
  const list=await call(tools.list,{studentId});
  expect(list.data).toEqual(await (await page.request.get(modes("list"))).json());
  expect(list.data.reports).toHaveLength(1);

  // Reopen in a fresh signed browser context, without POST interception or
  // any in-memory receipt/review state from the tab that created the report.
  const reopenContext=await browser.newContext({baseURL,storageState:await page.context().storageState(),
   viewport:{width:320,height:820}});
  try{
  const reopened=await reopenContext.newPage();
  await reopened.goto("/students/"+studentId);
  const reopenPanel=reopened.locator("details").filter({hasText:"Learner report preview"});
  await reopened.getByText("Learner report preview",{exact:true}).click();
  await expect(reopenPanel.getByRole("button",{name:"Saved private reports",exact:true})).toBeEnabled();
  let failedList:string|null=null;
  reopened.on("requestfailed",req=>{
   if(req.url()===baseURL+modes("list"))failedList=req.failure()?.errorText??"request failed";
  });
  const waitingList=reopened.waitForResponse(response=>response.url()===baseURL+modes("list")&&
    response.request().resourceType()==="fetch",{timeout:15_000}).catch(()=>null);
  await reopenPanel.getByRole("button",{name:"Saved private reports",exact:true}).click();
  const loadedList=await waitingList;
  expect(loadedList,failedList??"Saved reports browser fetch did not complete").not.toBeNull();
  expect(loadedList!.ok(),await loadedList!.text()).toBe(true);
  expect(await loadedList!.json()).toEqual(list.data);
  const savedButton=reopenPanel.getByRole("region",{name:"Saved private reports"})
    .getByRole("button",{name:/Synthetic private school/});
  await expect(savedButton).toBeVisible();
  await savedButton.click();
  const rendered=reopenPanel.getByRole("region",{name:"נוכחות מתועדת בשיעורים"});
  await expect(rendered).toHaveAttribute("dir","rtl");
  await expect(rendered.getByRole("listitem")).toHaveCount(2);
  expect(await reopenPanel.evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(await reopenPanel.evaluate(el=>el.clientWidth)+1);
  }finally{await reopenContext.close();}
  const outsiderPage=await browser.newPage();
  try{
   expect((await outsiderPage.request.get(baseURL+modes("get",{publicationId}))).status()).toBe(401);
   const read=await delegatedTool(outsiderPage,request,"coach:read",{email:foreign.email,password});
   expect((await read.listTools()).map(x=>x.name)).not.toContain(tools.save);
   expect((await read(tools.get,{studentId,publicationId})).error?.code).toBe("NOT_FOUND");
   expect((await outsiderPage.request.get(baseURL+modes("get",{publicationId}))).status()).toBe(404);
  }finally{await outsiderPage.close();}
  expect(await publications()).toEqual(durable);
  expect(await unaffected()).toEqual(unaffectedBefore);
 }finally{
  for(const id of users)expect((await admin.auth.admin.deleteUser(id,true)).error).toBeNull();
 }
});
