import {createHash,randomBytes,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-professional-private-report-lifecycle reviews, replaces and revokes exact saved reports without transferring any guest access",async({page,request,browser})=>{
 test.setTimeout(180_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const users:string[]=[];
 const password="SyntheticReportLifecycle9!";
 async function tenant(){
  const email="report-decision-"+randomUUID()+"@example.invalid";
  const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  const id=identity.data.user!.id;
  users.push(id);
  expect((await admin.from("teachers").insert({id,email,display_name:"Synthetic report lifecycle teacher",
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
  const owner=await tenant(),foreigner=await tenant(),teacher_id=owner.id;
  const studentId=await row("students",{teacher_id,name:"Synthetic report decision learner"});
  const otherId=await row("students",{teacher_id,name:"Unrelated learner"});
  const workplaceId=await row("workplaces",{teacher_id,name:"Synthetic decision school",timezone:"Asia/Jerusalem",
   locale:"en",currency:"ILS",kind:"professional",policy:{}});
  const from=new Date(Date.now()-8*86400000).toISOString().slice(0,10);
  const startsOn=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  expect((await admin.from("workplace_enrollments").insert([studentId,otherId].map(student_id=>({
   teacher_id,workplace_id:workplaceId,student_id,starts_on:startsOn,source:"manual",
  })))).error).toBeNull();
  const base=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;
  const call=await delegatedTool(page,request,undefined,{email:owner.email,password});
  const entitlement=await row("teacher_entitlement_grants",{teacher_id,kind:"capability_boost",boolean_value:true,
   capability_key:"reports.publish",capability_kind:"boolean",reason:"Synthetic report decision proof",request_id:randomUUID()});
  const sessionId=await row("teaching_sessions",{teacher_id,workplace_id:workplaceId,roster_mode:"ad_hoc",
   starts_at:from+"T10:00:00Z",local_timezone:"Asia/Jerusalem",duration_minutes:30,
   title:"Unshared fixture lesson",lesson_note:"Private teaching remark",request_id:randomUUID()});
  expect((await admin.from("session_participants").insert([studentId,otherId].map(student_id=>({
   teacher_id,session_id:sessionId,student_id,
  })))).error).toBeNull();
  const roster=await call("ccp_sessions_roster_preview",{sessionId});
  expect(roster.error).toBeUndefined();
  expect((await call("ccp_sessions_complete",{sessionId,expectedUpdatedAt:roster.data.updatedAt,confirmed:true,
   attendance:[{studentId,status:"present",expectedUpdatedAt:null,note:"Private evidence"},
    {studentId:otherId,status:"late",expectedUpdatedAt:null,note:"Exclude other learner notes"}],
   idempotencyKey:randomUUID()})).error).toBeUndefined();
  const save=async (learner:string,outputLocale:string)=>{
   const input={studentId:learner,workplaceId,from,to:from,outputLocale};
   const checked=await call("ccp_private_learner_report_review",input);
   expect(checked.error).toBeUndefined();
   const sealed=await call("ccp_private_learner_report_save",{...input,reviewDigest:checked.data.reviewDigest,
    requestId:randomUUID(),confirmed:true});
   expect(sealed.error).toBeUndefined();
   return {publicationId:sealed.data.publicationId as string,candidate:checked.data.candidate};
  };
  const original=await save(studentId,"he");
  const priorAttendance=await admin.from("session_attendance").select("updated_at")
   .eq("session_id",sessionId).eq("student_id",studentId).single();
  expect(priorAttendance.error).toBeNull();
  expect((await call("ccp_attendance_record",{sessionId,studentId,status:"excused",
   note:"Private corrected evidence",expectedUpdatedAt:priorAttendance.data!.updated_at,idempotencyKey:randomUUID()})).error).toBeUndefined();
  const replacement=await save(studentId,"en");
  const revokeOnly=await save(studentId,"ru");
  const wrongLearner=await save(otherId,"en");
  async function syntheticGrant(name:string){
   const contactId=await row("contacts",{teacher_id,display_name:name});
   await row("student_contacts",{teacher_id,student_id:studentId,contact_id:contactId,
    relationship_label:"Synthetic report contact",is_legal_guardian:true});
   const token=randomBytes(32).toString("base64url");
   const portalGrantId=await row("portal_access_grants",{teacher_id,student_id:studentId,workplace_id:workplaceId,
    contact_id:contactId,permissions:["shared_notes"],issued_at:new Date().toISOString(),
    expires_at:new Date(Date.now()+3*86400000).toISOString(),revision:2,token_digest:createHash("sha256").update(token).digest("hex")});
   return {portalGrantId,token};
  }
  const first=await syntheticGrant("Original portal guest"),second=await syntheticGrant("Another original portal guest");
  const third=await syntheticGrant("Revoke-only portal guest");
  async function approve(publicationId:string,portalGrantId:string){
   const scope={studentId,publicationId,portalGrantId};
   const review=await call("ccp_private_learner_report_audience_review",scope);
   expect(review.error).toBeUndefined();
   const result=await call("ccp_private_learner_report_audience_approve",{...scope,reviewDigest:review.data.reviewDigest,
    requestId:randomUUID(),confirmed:true});
   expect(result.error).toBeUndefined();
  }
  await approve(original.publicationId,first.portalGrantId);
  await approve(revokeOnly.publicationId,third.portalGrantId);
  const tools={choices:"ccp_private_learner_report_replacement_choices",
   review:"ccp_private_learner_report_lifecycle_review",commit:"ccp_private_learner_report_revoke_or_supersede"};
  const initialScope={studentId,publicationId:original.publicationId};
  const replaceArgs={...initialScope,replacementId:replacement.publicationId};
  const endpoint="/api/students/"+studentId+"/private-reports/lifecycle";
  const modes=(mode:string,publicationId:string,replacementId?:string)=>endpoint+"?"+
   new URLSearchParams({mode,publicationId,...(replacementId?{replacementId}:{})});
  const publications=async()=>{
   const r=await admin.from("report_publications").select("id,revision,snapshot_digest,superseded_by,revoked_at")
    .eq("teacher_id",teacher_id).order("id");
   expect(r.error).toBeNull();return r.data!;
  };
  const unchanged=async()=>{
   const tables=["report_publication_audiences","portal_access_grants","notifications","financial_obligations","received_payments","payment_allocations"];
   const results=await Promise.all(tables.map(table=>admin.from(table).select("*").eq("teacher_id",teacher_id)));
   for(let i=0;i<tables.length;i++)expect(results[i].error,tables[i]).toBeNull();
   return results.map(r=>r.data!.map(x=>JSON.stringify(x)).sort());
  };
  const before=await publications();
  const choices=await call(tools.choices,initialScope);
  expect(choices.error).toBeUndefined();
  expect(choices.data.choices.map((r:{publicationId:string})=>r.publicationId)).toEqual([replacement.publicationId]);
  expect(await (await page.request.get(modes("choices",original.publicationId))).json()).toEqual(choices.data);
  for(const bad of [original.publicationId,revokeOnly.publicationId,wrongLearner.publicationId]){
   expect((await call(tools.review,{...initialScope,replacementId:bad})).error?.code).toBe("REPORT_REPLACEMENT_UNAVAILABLE");
  }
  const review=await call(tools.review,replaceArgs);
  expect(review.error).toBeUndefined();
  expect(review.data).toMatchObject({action:"supersede",notWithdrawnApprovals:1,
   original:{candidate:original.candidate,revision:"1"},replacement:{candidate:replacement.candidate}});
  expect(await (await page.request.get(modes("review",original.publicationId,replacement.publicationId))).json()).toEqual(review.data);
  const payload={publicationId:original.publicationId,replacementId:replacement.publicationId,reviewDigest:review.data.reviewDigest,
   requestId:randomUUID(),confirmed:true};
  expect((await page.request.post(endpoint,{data:payload})).status()).toBe(403);
  expect((await page.request.post(endpoint,{headers:{origin:base},data:{...payload,confirmed:false}})).status()).toBe(400);
  expect(await publications()).toEqual(before);

  const guestContext=await browser.newContext({baseURL:base,viewport:{width:320,height:820}});
  try{
   const guest=await guestContext.newPage();
   const guestReports=guest.getByRole("region",{name:"Shared attendance reports"});
   async function seen(grant:{token:string},count:number){
    const r=await guest.goto(base+"/portal/"+grant.token);
    expect(r?.status()).toBe(200);await expect(guestReports).toHaveCount(count);
   }
   await seen(first,1);
   await seen(second,0);
   await seen(third,1);
   await page.setViewportSize({width:320,height:820});
   await page.goto("/students/"+studentId);
   await page.getByText("Learner report preview",{exact:true}).click();
   const panel=page.locator("details").filter({hasText:"Learner report preview"});
   await panel.getByRole("button",{name:"Saved private reports",exact:true}).click();
   const savedList=panel.getByRole("region",{name:"Saved private reports"});
   await savedList.getByRole("button",{name:/עברית/}).click();
   const decision=panel.getByRole("region",{name:"Saved report decisions"});
   await decision.getByRole("button",{name:"Find a saved replacement"}).click();
   await decision.getByLabel("Newer private report").selectOption(replacement.publicationId);
   await decision.getByRole("button",{name:"Review replacing this report"}).click();
   await expect(decision.getByText(/Previous approvals not individually withdrawn: 1/)).toBeVisible();
   await approve(original.publicationId,second.portalGrantId);
   await decision.getByRole("button",{name:"Mark report as replaced"}).click();
   await expect(decision.getByRole("alert")).toContainText("approvals changed");
   expect(await publications()).toEqual(before);
   await seen(second,1);
   expect((await admin.from("teacher_entitlement_grants").update({revoked_at:new Date().toISOString()})
    .eq("id",entitlement)).error).toBeNull();
   const unchangedBefore=await unchanged();
   await decision.getByRole("button",{name:"Review replacing this report"}).click();
   await expect(decision.getByText(/Previous approvals not individually withdrawn: 2/)).toBeVisible();
   await expect(decision.getByText("Corrected saved report")).toBeVisible();
   expect(await decision.evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(await decision.evaluate(el=>el.clientWidth)+1);
   const latest=await call(tools.review,replaceArgs);
   expect(latest.data.reviewDigest).not.toBe(review.data.reviewDigest);
   const sent:Record<string,unknown>[]=[];
   await page.route(base+endpoint,async route=>{
    if(route.request().method()!=="POST"||!route.request().postDataJSON().replacementId){await route.continue();return;}
    sent.push(route.request().postDataJSON());
    const r=await route.fetch();
    expect(r.status(),await r.text()).toBe(200);
    if(sent.length===1)await route.abort();
    else await route.fulfill({response:r});
   });
   await decision.getByRole("button",{name:"Mark report as replaced"}).click();
   await expect(decision.getByRole("alert")).toContainText("could not be confirmed");
   await expect(panel.getByRole("button",{name:"Saved private reports",exact:true})).toBeDisabled();
   await decision.getByRole("button",{name:"Retry the same report decision"}).click();
   await expect(panel.getByText(/old report was replaced.*no access was transferred/)).toBeVisible();
   expect(sent).toHaveLength(2);expect(sent[0]).toEqual(sent[1]);
   expect(sent[0]).toMatchObject({publicationId:original.publicationId,replacementId:replacement.publicationId,
    reviewDigest:latest.data.reviewDigest,confirmed:true});
   const replaced=await call(tools.commit,{studentId,...sent[0]});
   expect(replaced.error).toBeUndefined();
   expect(replaced.data).toMatchObject({status:"superseded",revision:"2",replacementId:replacement.publicationId,revokedAt:null});
   await seen(first,0);
   await seen(second,0);
   await seen(third,1);
   await savedList.getByRole("button",{name:/Русский/}).click();
   const revoke=panel.getByRole("region",{name:"Saved report decisions"});
   await revoke.getByRole("button",{name:"Review revoking this report"}).click();
   await expect(revoke.getByText(/Previous approvals not individually withdrawn: 1/)).toBeVisible();
   const revokeArgs={studentId,publicationId:revokeOnly.publicationId,replacementId:null};
   const toRevoke=await call(tools.review,revokeArgs);
   expect(toRevoke.error).toBeUndefined();
   expect(await (await page.request.get(modes("review",revokeOnly.publicationId))).json()).toEqual(toRevoke.data);
   const responseWait=page.waitForResponse(r=>r.url()===base+endpoint&&r.request().method()==="POST");
   await revoke.getByRole("button",{name:"Revoke entire report access"}).click();
   const response=await responseWait;
   expect(response.status(),await response.text()).toBe(200);
   const same=await call(tools.commit,{studentId,...response.request().postDataJSON()});
   expect(same.error).toBeUndefined();
   expect(same.data).toEqual(await response.json());
   await expect(panel.getByText("All guest access was revoked. Your saved copy was kept.")).toBeVisible();
   await seen(third,0);
   const old=await call("ccp_private_learner_report_get",initialScope);
   expect(old.data).toMatchObject({status:"superseded",candidate:original.candidate});
   const corrected=await call("ccp_private_learner_report_get",{studentId,publicationId:replacement.publicationId});
   expect(corrected.data).toMatchObject({status:"sealed",candidate:replacement.candidate});
   const revoked=await call("ccp_private_learner_report_get",{studentId,publicationId:revokeOnly.publicationId});
   expect(revoked.data).toMatchObject({status:"revoked",candidate:revokeOnly.candidate});
   expect(await unchanged()).toEqual(unchangedBefore);
  }finally{await guestContext.close();}
  const outsider=await browser.newPage();
  try{
   expect((await outsider.request.get(base+modes("review",original.publicationId))).status()).toBe(401);
   const read=await delegatedTool(outsider,request,"coach:read",{email:foreigner.email,password});
   expect((await read.listTools()).map(tool=>tool.name)).not.toContain(tools.commit);
   expect((await read(tools.review,replaceArgs)).error?.code).toBe("NOT_FOUND");
   expect((await outsider.request.get(base+modes("review",original.publicationId))).status()).toBe(404);
  }finally{await outsider.close();}
 }finally{
  for(const id of users)expect((await admin.auth.admin.deleteUser(id,true)).error).toBeNull();
 }
});
