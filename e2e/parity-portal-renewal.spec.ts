import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";

const origin=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;
const day=(n:number)=>new Date(Date.now()+n*86400000).toISOString();

test("PARITY: exact active portal renewal invalidates old links before separately approved reissue",async({page,request,playwright,isolatedTeacher})=>{
 test.setTimeout(75_000);
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const run=async(name:string,args:Record<string,unknown>)=>{
  const result=await call(name,args);expect(result.error?.code,name).toBeUndefined();return result.data;
 };
 const key=()=>({idempotencyKey:randomUUID(),confirmed:true});
 const studentId=(await run("ccp_students_create",{name:"Renewal test student "+randomUUID(),
  idempotencyKey:randomUUID()})).entityId as string;
 const workplaceId=(await run("ccp_workplaces_create",{name:"Renewal classroom "+randomUUID(),
  timezone:"UTC",currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID()})).entityId as string;
 await run("ccp_workplaces_enroll",{studentId,workplaceId,idempotencyKey:randomUUID()});
 const contact=await run("ccp_contacts_create",{displayName:"Renewal guest "+randomUUID(),...key()});
 const relation=await run("ccp_student_contacts_link",{studentId,contactId:contact.id,relationshipLabel:"Student contact",...key()});
 const grant=await run("ccp_portal_grants_create",{studentId,workplaceId,contactId:contact.id,
  billingAccountId:null,permissions:["calendar"],expiresAt:day(4),...key()});
 const endpoint="/api/portal-grants/"+grant.id;
 const issue=async(expectedRevision:number)=>{
  const response=await page.request.post(endpoint+"/issue",{headers:{origin},
   data:{expectedRevision,confirmed:true}});
  expect(response.status()).toBe(200);
  return new URL((await response.json()).url).pathname;
 };
 const guest=await playwright.request.newContext({baseURL:origin});
 try{
  const previousPath=await issue(1);
  expect((await guest.get("/api"+previousPath+"/calendar")).status()).toBe(200);
  const safe=await run("ccp_portal_grants_get",{grantId:grant.id});
  const expiresAt=day(12);
  const preview=await run("ccp_portal_grants_renew_preview",{grantId:grant.id,expiresAt});
  const browserPreview=await page.request.get(endpoint+"?renewExpiresAt="+encodeURIComponent(expiresAt));
  expect(browserPreview.status()).toBe(200);
  expect(await browserPreview.json()).toEqual(preview);
  expect(preview).toMatchObject({grant:safe,expiresAt,invalidatesExistingLink:true,requiresSeparateBrowserIssue:true});
  expect(await run("ccp_portal_grants_get",{grantId:grant.id})).toEqual(safe);
  expect((await call("ccp_portal_grants_renew_preview",{grantId:grant.id,expiresAt:day(2)})).error?.code).toBe("INVALID_EXPIRY");
  expect((await call("ccp_portal_grants_renew_preview",{grantId:grant.id,expiresAt:day(400)})).error?.code).toBe("INVALID_EXPIRY");
  const renew={expiresAt,expectedRevision:2,...key()};
  expect((await page.request.patch(endpoint,{headers:{origin:"https://wrong.example.invalid"},data:renew})).status()).toBe(403);
  const committed=await page.request.patch(endpoint,{headers:{origin},data:renew});
  expect(committed.status()).toBe(200);
  const renewed=await committed.json();
  expect(renewed).toMatchObject({id:grant.id,studentId,workplaceId,contactId:contact.id,
   permissions:["calendar"],revision:3,issued:false,replayed:false});
  expect(new Date(renewed.expiresAt).toISOString()).toBe(expiresAt);
  for(const field of ["url","token","tokenDigest","secret"])expect(renewed).not.toHaveProperty(field);
  expect(await run("ccp_portal_grants_renew",{grantId:grant.id,...renew})).toEqual({...renewed,replayed:true});
  expect((await call("ccp_portal_grants_renew",{grantId:grant.id,...renew,expiresAt:day(13)})).error?.code).toBe("IDEMPOTENCY_CONFLICT");
  expect((await call("ccp_portal_grants_renew",{grantId:grant.id,...renew,...key()})).error?.code).toBe("STALE_REVISION");
  expect((await guest.get("/api"+previousPath+"/calendar")).status()).toBe(404);

  // Current workflow has a real review/confirm UI. Simulate a lost
  // acknowledgement of one ordinary owned renewal, then exact retry.
  await page.goto("/students/"+studentId);
  await page.getByRole("button",{name:"Renew grant",exact:true}).click();
  await page.getByRole("button",{name:"Review renewal",exact:true}).click();
  await expect(page.getByText(/Any existing link stops working/)).toBeVisible();
  const bodies:string[]=[];
  await page.route("**"+endpoint,async route=>{
   if(route.request().method()!=="PATCH"){await route.continue();return;}
   bodies.push(route.request().postData()??"");
   if(bodies.length===1){
    const response=await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort();return;
   }
   await route.continue();
  });
  await page.getByRole("button",{name:"Confirm renewal",exact:true}).click();
  const retry=page.getByRole("button",{name:"Retry exact renewal",exact:true});
  await expect(retry).toBeVisible();
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({hasText:"Grant renewed. Issue a new secure link separately."})).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
  await page.unroute("**"+endpoint);
  const beforeReissue=await run("ccp_portal_grants_get",{grantId:grant.id});
  expect(beforeReissue).toMatchObject({id:grant.id,revision:4,issued:false,permissions:["calendar"]});
  const newPath=await issue(4);
  expect(newPath===previousPath).toBe(false);
  expect((await guest.get("/api"+newPath+"/calendar")).status()).toBe(200);
  expect((await guest.get("/api"+previousPath+"/calendar")).status()).toBe(404);
  const expired=await run("ccp_portal_grants_create",{studentId,workplaceId,contactId:contact.id,
   billingAccountId:null,permissions:["calendar"],expiresAt:day(4),...key()});
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
  const owner=await admin.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
  expect(owner.error).toBeNull();
  // A separate owned fixture represents a previously expired grant.
  expect((await admin.from("portal_access_grants").update({created_at:day(-3),expires_at:day(-1)})
   .eq("teacher_id",owner.data!.id).eq("id",expired.id)).error).toBeNull();
  expect((await call("ccp_portal_grants_renew_preview",{grantId:expired.id,expiresAt:day(150)})).error?.code).toBe("EXPIRED");
  expect((await call("ccp_portal_grants_renew",{grantId:expired.id,expectedRevision:1,expiresAt:day(150),...key()})).error?.code).toBe("EXPIRED");
  await run("ccp_student_contacts_unlink",{studentId,linkId:relation.id,expectedRevision:relation.revision,...key()});
  expect((await call("ccp_portal_grants_renew_preview",{grantId:grant.id,expiresAt:day(150)})).error?.code).toBe("SCOPE_INACTIVE");
  expect((await call("ccp_portal_grants_renew",{grantId:grant.id,expectedRevision:5,expiresAt:day(150),...key()})).error?.code).toBe("SCOPE_INACTIVE");
  expect((await run("ccp_portal_grants_get",{grantId:grant.id})).revision).toBe(5);
  expect((await guest.get("/api"+newPath+"/calendar")).status()).toBe(404);
  await run("ccp_portal_grants_revoke",{grantId:grant.id,expectedRevision:5,...key()});
  expect((await call("ccp_portal_grants_renew_preview",{grantId:grant.id,expiresAt:day(150)})).error?.code).toBe("REVOKED");
  expect((await guest.get("/api"+newPath+"/calendar")).status()).toBe(404);
 }finally{await guest.dispose();}
});

test.describe("teacher-timezone portal presentation",()=>{
 test.use({locale:"en-US",timezoneId:"Pacific/Honolulu"});
 test("PARITY: Russian coach sees grant expiry and exact renewal in the teacher timezone",async({
  page,request,isolatedTeacher,
 })=>{
  const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
  const run=async(name:string,args:Record<string,unknown>)=>{
   const result=await call(name,args);expect(result.error?.code,name).toBeUndefined();return result.data;
  };
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
  const owner=await db.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
  expect(owner.error).toBeNull();
  const teacherId=owner.data!.id;
  const timeZone="Asia/Jerusalem";
  expect((await db.from("teachers").update({preferred_locale:"ru"}).eq("id",teacherId)).error).toBeNull();
  expect((await db.from("teacher_settings").upsert({teacher_id:teacherId,timezone:timeZone})).error).toBeNull();
  const clock=new Date();clock.setUTCHours(23,40,0,0);
  await page.clock.setFixedTime(clock);
  const key=()=>({idempotencyKey:randomUUID(),confirmed:true});
  const studentId=(await run("ccp_students_create",{name:"Synthetic locale pupil "+randomUUID(),idempotencyKey:randomUUID()})).entityId;
  const workplaceId=(await run("ccp_workplaces_create",{name:"Synthetic locale venue "+randomUUID(),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID()})).entityId;
  await run("ccp_workplaces_enroll",{studentId,workplaceId,idempotencyKey:randomUUID()});
  const contact=await run("ccp_contacts_create",{displayName:"Synthetic locale contact "+randomUUID(),...key()});
  await run("ccp_student_contacts_link",{studentId,contactId:contact.id,relationshipLabel:"Synthetic guest",...key()});
  const original=new Date(clock.getTime()+4*86_400_000).toISOString();
  const grant=await run("ccp_portal_grants_create",{studentId,workplaceId,contactId:contact.id,
   permissions:["calendar"],expiresAt:original,...key()});
  const endpoint="/api/portal-grants/"+grant.id;

  await page.goto("/students/"+studentId);
  await expect(page.locator("html")).toHaveAttribute("lang","ru");
  const format=(iso:string,withTime:boolean)=>page.evaluate(({iso,withTime,timeZone})=>{
   const parts={year:"numeric",month:"numeric",day:"numeric"} as const;
   const clock={hour:"numeric",minute:"2-digit",timeZoneName:"short"} as const;
   return {
    teacher:new Intl.DateTimeFormat("ru",{...parts,...(withTime?clock:{}),timeZone}).format(new Date(iso)),
    browser:new Intl.DateTimeFormat("en-US",{...parts,...(withTime?clock:{})}).format(new Date(iso)),
    teacherDay:new Intl.DateTimeFormat("en-US",{...parts,timeZone}).format(new Date(iso)),
    browserDay:new Intl.DateTimeFormat("en-US",parts).format(new Date(iso)),
   };
  },{iso,withTime,timeZone});
  const local=await format(original,false);
  expect(local.teacherDay).not.toBe(local.browserDay);
  const expiry=page.getByText(/Истекает:/).locator("time");
  await expect(expiry).toHaveText(local.teacher);
  expect(await expiry.textContent()).not.toBe(local.browser);
  expect(new Date((await expiry.getAttribute("datetime"))!).toISOString()).toBe(original);
  await page.getByRole("button",{name:"Продлить доступ",exact:true}).click();
  const [preview]=await Promise.all([
   page.waitForResponse(r=>r.request().method()==="GET"&&new URL(r.url()).pathname===endpoint&&
    new URL(r.url()).searchParams.has("renewExpiresAt")),
   page.getByRole("button",{name:"Проверить продление",exact:true}).click(),
  ]);
  expect(preview.status()).toBe(200);
  const renewedAt=new Date(clock.getTime()+90*86_400_000).toISOString();
  const websitePreview=await preview.json();
  expect(websitePreview.expiresAt).toBe(renewedAt);
  expect(await run("ccp_portal_grants_renew_preview",{grantId:grant.id,expiresAt:renewedAt})).toEqual(websitePreview);
  const renewal=await format(renewedAt,true);
  expect(renewal.teacherDay).not.toBe(renewal.browserDay);
  const approval=page.getByText(/Новый срок:/);
  await expect(approval).toContainText(renewal.teacher);
  await expect(approval).not.toContainText(renewal.browser);
  const readback=await run("ccp_portal_grants_get",{grantId:grant.id});
  expect(readback).toMatchObject({revision:1,issued:false});
  expect(new Date(readback.expiresAt).toISOString()).toBe(original);
 });
});
