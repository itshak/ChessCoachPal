import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";

const origin=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;
const future=(days:number)=>new Date(Date.now()+days*86400000).toISOString();

test("PARITY: scoped guest sees only complete invoices for the exact authorized payer, learner and venue",async({page,request,playwright,browser,isolatedTeacher})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const owner=await admin.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
 expect(owner.error).toBeNull();
 const teacherId=owner.data!.id as string;
 const id=()=>randomUUID();
 const pupil=await call("ccp_students_create",{name:"Portal fixture pupil "+id(),idempotencyKey:id()});
 expect(pupil.error).toBeUndefined();
 const studentId=pupil.data.entityId as string;
 const venue=async(label:string)=>{
  const made=await call("ccp_workplaces_create",{name:label+" "+id(),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:id()});
  expect(made.error).toBeUndefined();
  const workplaceId=made.data.entityId as string;
  expect((await call("ccp_workplaces_enroll",{studentId,workplaceId,idempotencyKey:id()})).error)
   .toBeUndefined();
  return workplaceId;
 };
 const school=await venue("School"),privateVenue=await venue("Private");
 const marker=(n:number)=>`2041-02-${String(n).padStart(2,"0")}`;
 const lesson=async(workplaceId:string,day:number,hour="10",learnerId=studentId)=>{
  const created=await call("ccp_sessions_create",{workplaceId,studentId:learnerId,title:"Synthetic chess "+id(),
   startsAt:marker(day)+"T"+hour+":00:00Z",durationMinutes:45,idempotencyKey:id()});
  expect(created.error).toBeUndefined();
  return created.data.entityId as string;
 };
 const schoolSession=await lesson(school,1),mixedSchool=await lesson(school,2);
 const mixedPrivate=await lesson(privateVenue,2,"12");
 const alternateDebtorSession=await lesson(school,4),draftSession=await lesson(school,5);
 const contact=await call("ccp_contacts_create",{displayName:"Synthetic school recipient",
  idempotencyKey:id(),confirmed:true});
 expect(contact.error).toBeUndefined();
 const contactId=contact.data.id as string;
 expect((await call("ccp_student_contacts_link",{studentId,contactId,relationshipLabel:"School liaison",
  idempotencyKey:id(),confirmed:true})).error).toBeUndefined();
 const account=async(displayName:string)=>{
  const result=await call("ccp_billing_accounts_create",{displayName,accountKind:"organization",
   idempotencyKey:id(),confirmed:true});
  expect(result.error).toBeUndefined();
  return result.data.id as string;
 };
 const debtor=await account("Synthetic school account"),another=await account("Another debtor");
 for(const [workplaceId,billingAccountId,start,end] of [
  [school,debtor,1,3],[privateVenue,debtor,1,3],[school,another,4,4],[school,debtor,5,null],
 ] as const){
  const assigned=await call("ccp_student_billing_assignments_create",{
   studentId,workplaceId,billingAccountId,effectiveFrom:marker(start),
   effectiveTo:end===null?null:marker(end),idempotencyKey:id(),confirmed:true,
  });
  expect(assigned.error).toBeUndefined();
 }
 const otherPupil=await call("ccp_students_create",{name:"Other school pupil "+id(),idempotencyKey:id()});
 expect(otherPupil.error).toBeUndefined();
 const otherStudentId=otherPupil.data.entityId as string;
 expect((await call("ccp_workplaces_enroll",{studentId:otherStudentId,workplaceId:school,idempotencyKey:id()})).error)
  .toBeUndefined();
 expect((await call("ccp_student_billing_assignments_create",{
  studentId:otherStudentId,workplaceId:school,billingAccountId:debtor,
  effectiveFrom:marker(6),idempotencyKey:id(),confirmed:true,
 })).error).toBeUndefined();
 const otherPupilSession=await lesson(school,6,"10",otherStudentId);
 const invoiceIds:string[]=[];
 const seedInvoice=async(day:number,billingAccountId:string,sessions:(string|null)[],status:"draft"|"sent"="sent",learnerId=studentId)=>{
  // Build finished synthetic rows without initiating send, payment or checkout.
  const date=marker(day);
  const base=await admin.from("invoices").insert({teacher_id:teacherId,billing_account_id:billingAccountId,
   period_start:date,period_end:date,status:"draft",subtotal_cents:1250,currency:"USD"}).select("id").single();
  expect(base.error).toBeNull();
  const invoiceId=base.data!.id as string;invoiceIds.push(invoiceId);
  for(const [position,sessionId] of sessions.entries()){
   const line=await admin.from("invoice_items").insert({invoice_id:invoiceId,session_id:sessionId,
    student_id:sessionId?learnerId:null,description:"Synthetic history item",kind:"lesson",quantity:1,
    unit_cents:1250,amount_cents:1250,sort_order:position});
   expect(line.error).toBeNull();
  }
  if(status==="sent")expect((await admin.from("invoices").update({status,sent_at:new Date().toISOString()})
   .eq("teacher_id",teacherId).eq("id",invoiceId)).error).toBeNull();
 };
 const guest=await playwright.request.newContext({baseURL:origin});
 try{
  await seedInvoice(1,debtor,[schoolSession]);
  await seedInvoice(2,debtor,[mixedSchool,mixedPrivate]);
  await seedInvoice(3,debtor,[null]);
  await seedInvoice(4,another,[alternateDebtorSession]);
  await seedInvoice(5,debtor,[draftSession],"draft");
  await seedInvoice(6,debtor,[otherPupilSession],"sent",otherStudentId);
  const grants=await call("ccp_portal_grants_list",{studentId});
  expect(grants.error).toBeUndefined();
  expect(grants.data).toEqual([]);
  const grant=async(finance:boolean)=>{
   const made=await call("ccp_portal_grants_create",{studentId,contactId,workplaceId:school,
    expiresAt:future(2),permissions:finance?["finance"]:["calendar"],
    billingAccountId:finance?debtor:null,idempotencyKey:id(),confirmed:true});
   expect(made.error).toBeUndefined();
   const grantId=made.data.id as string;
   expect(made.data.issued).toBe(false);
   return grantId;
  };
  const issue=async(grantId:string,expectedRevision:number)=>{
   const issued=await page.request.post("/api/portal-grants/"+grantId+"/issue",{
    headers:{origin},data:{expectedRevision,confirmed:true},
   });
   expect(issued.status()).toBe(200);
   expect(issued.headers()["cache-control"]).toContain("no-store");
   return new URL((await issued.json()).url).pathname;
  };
  const read=async(path:string,allowed:boolean)=>{
   const response=await guest.get(path);
   const html=await response.text();
   expect(response.headers()["cache-control"]).toContain("no-store");
   expect(response.headers()["referrer-policy"]).toBe("no-referrer");
   if(allowed){expect(response.status()).toBe(200);expect(html).toContain(marker(1));}
   else expect(html).not.toContain(marker(1));
   for(const day of [2,3,4,5,6])expect(html).not.toContain(marker(day));
   expect(html).not.toMatch(/pay\.stripe\.com|Synthetic history item|Another debtor/);
  };
  await read(await issue(await grant(false),1),false);
  const financeId=await grant(true);
  const link=await issue(financeId,1);
  await read(link,true);
  const outside=await browser.newContext();
  try{
   const foreignPage=await outside.newPage(),foreign=await delegatedTool(foreignPage,request);
   expect((await foreign("ccp_portal_grants_get",{grantId:financeId})).error?.code).toBe("NOT_FOUND");
   expect((await foreignPage.request.get("/api/portal-grants/"+financeId)).status()).toBe(404);
  }finally{await outside.close();}
  const metadata=await call("ccp_portal_grants_get",{grantId:financeId});
  expect(metadata.error).toBeUndefined();
  expect(metadata.data).toMatchObject({billingAccountId:debtor,permissions:["finance"],issued:true});
  expect(JSON.stringify(metadata.data)).not.toContain(link.split("/").pop()!);
  const rotated=await issue(financeId,2);
  expect(rotated).not.toBe(link);
  await read(link,false);await read(rotated,true);
  const revoked=await call("ccp_portal_grants_revoke",{grantId:financeId,expectedRevision:3,
   idempotencyKey:id(),confirmed:true});
  expect(revoked.error).toBeUndefined();
  await read(rotated,false);
  const expiredId=await grant(true);
  const expired=await issue(expiredId,1);
  await read(expired,true);
  // Fixture-clock setup only: the approved grant is now a historically
  // issued but expired fixture. No live expiry rule or public route is changed.
  expect((await admin.from("portal_access_grants")
   .update({created_at:future(-4),issued_at:future(-4),expires_at:future(-1)})
   .eq("teacher_id",teacherId).eq("id",expiredId)).error).toBeNull();
  await read(expired,false);
 }finally{
  await guest.dispose();
  if(invoiceIds.length){
   // Use the normal sent-to-void transition before removing these exact
   // never-delivered fixtures. Nothing has payments or provider activity.
   expect((await admin.from("invoices").update({status:"void"})
    .eq("teacher_id",teacherId).in("id",invoiceIds).eq("status","sent")).error).toBeNull();
   expect((await admin.from("invoices").delete().eq("teacher_id",teacherId).in("id",invoiceIds)).error).toBeNull();
  }
 }
});
