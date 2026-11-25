import {createHash,randomBytes,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-professional-private-report-audience explicitly approves a sealed report for one existing grant and withdraws it",async({page,request,browser})=>{
 test.setTimeout(180_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const users:string[]=[];
 const password="SyntheticReportAudience9!";
 async function tenant(){
  const email="report-audience-"+randomUUID()+"@example.invalid";
  const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  const id=identity.data.user!.id;
  users.push(id);
  expect((await admin.from("teachers").insert({id,email,display_name:"Synthetic report audience teacher",
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
  const studentId=await row("students",{teacher_id,name:"Selected synthetic learner"});
  const otherId=await row("students",{teacher_id,name:"Do not disclose other learner"});
  const workplaceId=await row("workplaces",{teacher_id,name:"Synthetic audience school",timezone:"Asia/Jerusalem",
   locale:"en",currency:"ILS",kind:"professional",policy:{}});
  const from=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  const started=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  expect((await admin.from("workplace_enrollments").insert([studentId,otherId].map(student_id=>({
   teacher_id,workplace_id:workplaceId,student_id,starts_on:started,source:"manual",
  })))).error).toBeNull();
  const ws="http://localhost:3000";
  const base=new URL(process.env.PLAYWRIGHT_BASE_URL??ws).origin;
  const call=await delegatedTool(page,request,undefined,{email:owner.email,password});
  const cap=await row("teacher_entitlement_grants",{teacher_id,kind:"capability_boost",capability_key:"reports.publish",
   capability_kind:"boolean",boolean_value:true,reason:"Synthetic recipient approval only",request_id:randomUUID()});
  const sessionId=await row("teaching_sessions",{teacher_id,workplace_id:workplaceId,roster_mode:"ad_hoc",
   starts_at:from+"T10:00:00Z",local_timezone:"Asia/Jerusalem",duration_minutes:30,
   title:"Excluded lesson title",lesson_note:"Never disclose attendance source note",request_id:randomUUID()});
  expect((await admin.from("session_participants").insert([studentId,otherId].map(student_id=>({
   teacher_id,session_id:sessionId,student_id,
  })))).error).toBeNull();
  const roster=await call("ccp_sessions_roster_preview",{sessionId});
  expect(roster.error).toBeUndefined();
  expect((await call("ccp_sessions_complete",{sessionId,expectedUpdatedAt:roster.data.updatedAt,confirmed:true,
   attendance:[{studentId,status:"present",expectedUpdatedAt:null,note:"Source-only attendance note"},
    {studentId:otherId,status:"late",expectedUpdatedAt:null,note:"Excluded learner explanation"}],
   idempotencyKey:randomUUID()})).error).toBeUndefined();
  const parameters={studentId,workplaceId,from,to:from,outputLocale:"he"};
  const sealReview=await call("ccp_private_learner_report_review",parameters);
  expect(sealReview.error).toBeUndefined();
  const saved=await call("ccp_private_learner_report_save",{...parameters,reviewDigest:sealReview.data.reviewDigest,
   requestId:randomUUID(),confirmed:true});
  expect(saved.error).toBeUndefined();
  const publicationId=saved.data.publicationId as string;
  const tools={list:"ccp_private_learner_report_audience_list",review:"ccp_private_learner_report_audience_review",
   approve:"ccp_private_learner_report_audience_approve",withdraw:"ccp_private_learner_report_audience_revoke"};
  const scope={studentId,publicationId};
  async function syntheticGrant(name:string,learner=studentId,legal=false){
   const contactId=await row("contacts",{teacher_id,display_name:name});
   await row("student_contacts",{teacher_id,student_id:learner,contact_id:contactId,
    relationship_label:"Synthetic relation",is_legal_guardian:legal,may_receive_messages:legal});
   const token=randomBytes(32).toString("base64url");
   const portalGrantId=await row("portal_access_grants",{teacher_id,student_id:learner,workplace_id:workplaceId,
    contact_id:contactId,permissions:["shared_notes"],issued_at:new Date().toISOString(),
    expires_at:new Date(Date.now()+3*86400000).toISOString(),revision:2,
    token_digest:createHash("sha256").update(token).digest("hex")});
   return {token,portalGrantId,contactId};
  }
  const chosen=await syntheticGrant("Chosen synthetic recipient");
  const unapproved=await syntheticGrant("Other linked guardian",studentId,true);
  const wrong=await syntheticGrant("Other learner recipient",otherId);
  const endpoint="/api/students/"+studentId+"/private-reports/audience";
  const lookup=(mode:string,params:Record<string,string>={})=>endpoint+"?"+new URLSearchParams({mode,publicationId,...params});
  async function audiences(){
   const result=await admin.from("report_publication_audiences").select("publication_id,portal_grant_id,request_id,revoked_at")
    .eq("teacher_id",teacher_id);
   expect(result.error).toBeNull();
   return result.data!;
  }
  async function sideEffects(){
   const tables=["notifications","portal_access_grants","financial_obligations","received_payments","payment_allocations"];
   const rows=await Promise.all(tables.map(table=>admin.from(table).select("*").eq("teacher_id",teacher_id)));
   for(let i=0;i<rows.length;i++)expect(rows[i].error,tables[i]).toBeNull();
   return rows.map(r=>r.data!.map(x=>JSON.stringify(x)).sort());
  }
  const unchanged=await sideEffects();
  const guestContext=await browser.newContext({baseURL:base,viewport:{width:320,height:820}});
  try{
   const guest=await guestContext.newPage();
   const section=guest.getByRole("region",{name:"Shared attendance reports"});
   async function openGuest(token:string){
    const response=await guest.goto(base+"/portal/"+token);
    expect(response?.status()).toBe(200);
    const headers=await response!.allHeaders();
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["referrer-policy"]).toBe("no-referrer");
   }
   await openGuest(chosen.token);
   await expect(section).toHaveCount(0);
   const list=await call(tools.list,scope);
   expect(list.error).toBeUndefined();
   expect(list.data.choices.map((x:{portalGrantId:string})=>x.portalGrantId).sort()).toEqual(
    [chosen.portalGrantId,unapproved.portalGrantId].sort());
   expect(await (await page.request.get(lookup("list"))).json()).toEqual(list.data);
   expect((await call(tools.review,{...scope,portalGrantId:wrong.portalGrantId})).error?.code).toBe("NOT_FOUND");
   const reviewArgs={...scope,portalGrantId:chosen.portalGrantId};
   const initial=await call(tools.review,reviewArgs);
   expect(initial.error).toBeUndefined();
   expect(await (await page.request.get(lookup("review",{portalGrantId:chosen.portalGrantId}))).json()).toEqual(initial.data);
   expect(initial.data).toMatchObject({recipientName:"Chosen synthetic recipient",learnerName:"Selected synthetic learner",
    workplaceName:"Synthetic audience school",publicationId,grantRevision:"2"});
   expect(JSON.stringify(initial.data)).not.toContain(chosen.token);
   expect(await audiences()).toEqual([]);
   const wrongOrigin=await page.request.post(endpoint,{data:{mode:"approve",publicationId,portalGrantId:chosen.portalGrantId,
    requestId:randomUUID(),reviewDigest:initial.data.reviewDigest,confirmed:true}});
   expect(wrongOrigin.status()).toBe(403);
   await page.setViewportSize({width:320,height:820});
   await page.goto("/students/"+studentId);
   await page.getByText("Learner report preview",{exact:true}).click();
   const panel=page.locator("details").filter({hasText:"Learner report preview"});
   await panel.getByRole("button",{name:"Saved private reports",exact:true}).click();
   await panel.getByRole("region",{name:"Saved private reports"}).getByRole("button",{name:/Synthetic audience school/}).click();
   const access=panel.getByRole("region",{name:"Report access"});
   await access.getByRole("button",{name:"Check report access"}).click();
   await access.getByLabel("Existing portal recipient").selectOption(chosen.portalGrantId);
   await access.getByRole("button",{name:"Review recipient"}).click();
   await expect(access.getByText(/Allow Chosen synthetic recipient to see this saved report/)).toBeVisible();
   expect(await audiences()).toEqual([]);
   expect((await admin.from("contacts").update({display_name:"Renamed synthetic recipient"}).eq("id",chosen.contactId)).error).toBeNull();
   await access.getByRole("button",{name:"Approve report access"}).click();
   await expect(access.getByRole("alert")).toContainText("portal link has changed");
   expect(await audiences()).toEqual([]);
   await access.getByRole("button",{name:"Check report access"}).click();
   await access.getByLabel("Existing portal recipient").selectOption(chosen.portalGrantId);
   await access.getByRole("button",{name:"Review recipient"}).click();
   await expect(access.getByText(/Allow Renamed synthetic recipient/)).toBeVisible();
   const review=await call(tools.review,reviewArgs);
   expect(review.data.reviewDigest).not.toBe(initial.data.reviewDigest);
   const attempts:Record<string,unknown>[]=[];
   await page.route(base+endpoint,async route=>{
    if(route.request().method()!=="POST"||route.request().postDataJSON().mode!=="approve"){
     await route.continue();return;
    }
    attempts.push(route.request().postDataJSON());
    const response=await route.fetch();
    expect(response.status(),await response.text()).toBe(200);
    if(attempts.length===1)await route.abort();
    else await route.fulfill({response});
   });
   await access.getByRole("button",{name:"Approve report access"}).click();
   await expect(access.getByRole("alert")).toContainText("could not be confirmed");
   await expect(panel.getByRole("button",{name:"Saved private reports",exact:true})).toBeDisabled();
   await access.getByRole("button",{name:"Retry the same action"}).click();
   await expect(access.getByRole("status")).toContainText("No message was sent");
   expect(attempts).toHaveLength(2);
   expect(attempts[0]).toEqual(attempts[1]);
   expect(attempts[0]).toMatchObject({mode:"approve",publicationId,portalGrantId:chosen.portalGrantId,
    reviewDigest:review.data.reviewDigest,confirmed:true});
   const {mode,...requestBody}=attempts[0];
   expect(mode).toBe("approve");
   const receipt=await call(tools.approve,{studentId,...requestBody});
   expect(receipt.error).toBeUndefined();
   expect(receipt.data).toMatchObject({publicationId,portalGrantId:chosen.portalGrantId,approvalId:requestBody.requestId,revokedAt:null});
   expect(await audiences()).toHaveLength(1);
   expect(await access.evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(await access.evaluate(el=>el.clientWidth)+1);
   await openGuest(chosen.token);
   const article=section.getByRole("article");
   await expect(article).toHaveAttribute("lang","he");
   await expect(article).toHaveAttribute("dir","rtl");
   await expect(article.getByRole("listitem")).toHaveCount(1);
   await expect(article.getByRole("listitem")).toContainText(from);
   const reportMarkup=await article.innerHTML();
   for(const excluded of [studentId,otherId,workplaceId,sessionId,publicationId,chosen.token,
    "Source-only","Never disclose","Excluded learner","reviewDigest","token_digest"])
     expect(reportMarkup).not.toContain(excluded);
   await openGuest(unapproved.token);
   await expect(section).toHaveCount(0);
   await openGuest(wrong.token);
   await expect(section).toHaveCount(0);
   expect((await admin.from("teacher_entitlement_grants").update({revoked_at:new Date().toISOString()}).eq("id",cap)).error).toBeNull();
   await access.getByRole("button",{name:"Review withdrawal"}).click();
   await expect(access.getByText(/Withdraw access for Renamed synthetic recipient/)).toBeVisible();
   expect((await audiences())[0].revoked_at).toBeNull();
   await access.getByRole("button",{name:"Withdraw report access"}).click();
   await expect(access.getByRole("status")).toContainText("Report access withdrawn");
   const revoked=await call(tools.withdraw,{...reviewArgs,approvalId:receipt.data.approvalId,confirmed:true});
   expect(revoked.error).toBeUndefined();
   const after=await audiences();
   expect(after).toHaveLength(1);
   expect(revoked.data.revokedAt).toBe(after[0].revoked_at);
   await openGuest(chosen.token);
   await expect(section).toHaveCount(0);
   const teacherCopy=await call("ccp_private_learner_report_get",scope);
   expect(teacherCopy.data.candidate).toEqual(sealReview.data.candidate);
   expect(await sideEffects()).toEqual(unchanged);
  }finally{await guestContext.close();}
  const outsider=await browser.newPage();
  try{
   expect((await outsider.request.get(base+lookup("list"))).status()).toBe(401);
   const read=await delegatedTool(outsider,request,"coach:read",{email:foreign.email,password});
   expect((await read.listTools()).map(tool=>tool.name)).not.toContain(tools.approve);
   expect((await read(tools.list,scope)).error?.code).toBe("NOT_FOUND");
   expect((await outsider.request.get(base+lookup("list"))).status()).toBe(404);
  }finally{await outsider.close();}
 }finally{
  for(const id of users)expect((await admin.auth.admin.deleteUser(id,true)).error).toBeNull();
 }
});
