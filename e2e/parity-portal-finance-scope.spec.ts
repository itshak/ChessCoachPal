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
 const zeroSettledSession=await lesson(school,7),trustedLinkSession=await lesson(school,8);
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
 const seedInvoice=async(day:number,billingAccountId:string,sessions:(string|null)[],status:"draft"|"sent"|"paid"="sent",learnerId=studentId,amount=1250,approvedLink:string|null=null)=>{
  // Build finished synthetic rows without initiating send, payment or checkout.
  const date=marker(day);
  const base=await admin.from("invoices").insert({teacher_id:teacherId,billing_account_id:billingAccountId,
   period_start:date,period_end:date,status:"draft",subtotal_cents:amount,currency:"USD"}).select("id").single();
  expect(base.error).toBeNull();
  const invoiceId=base.data!.id as string;invoiceIds.push(invoiceId);
  for(const [position,sessionId] of sessions.entries()){
   const line=await admin.from("invoice_items").insert({invoice_id:invoiceId,session_id:sessionId,
    student_id:sessionId?learnerId:null,description:"Synthetic history item",kind:"lesson",quantity:1,
    unit_cents:amount,amount_cents:amount,sort_order:position});
   expect(line.error).toBeNull();
  }
  if(status!=="draft")expect((await admin.from("invoices").update({
   status:"sent",sent_at:new Date().toISOString(),stripe_checkout_url:approvedLink,
  }).eq("teacher_id",teacherId).eq("id",invoiceId)).error).toBeNull();
  if(status==="paid")expect((await admin.from("invoices").update({status:"paid"})
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
  await seedInvoice(7,debtor,[zeroSettledSession],"paid",studentId,0);
  const storedLink="https://checkout.stripe.com/c/pay/cs_test_disposable_fixture";
  await seedInvoice(8,debtor,[trustedLinkSession],"sent",studentId,600,storedLink);
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
   const fallback=">Contact your coach to arrange payment for this invoice.</p>";
   if(allowed){
    expect(response.status()).toBe(200);
    for(const day of [1,7,8])expect(html.includes(marker(day))).toBe(true);
    expect(html.split(fallback)).toHaveLength(2);
    expect(html.includes('href="'+storedLink+'"')).toBe(true);
   }else{
    for(const day of [1,7,8])expect(html.includes(marker(day))).toBe(false);
    expect(html.includes(fallback)).toBe(false);
    expect(html.includes(storedLink)).toBe(false);
   }
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
    .eq("teacher_id",teacherId).in("id",invoiceIds).in("status",["sent","paid"])).error).toBeNull();
   expect((await admin.from("invoices").delete().eq("teacher_id",teacherId).in("id",invoiceIds)).error).toBeNull();
  }
 }
});

test("PARITY: three guest contacts see only their own calendars, RSVP and prepaid purchase",async({page,request,playwright,isolatedTeacher})=>{
 test.setTimeout(60_000);
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const owner=await admin.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
 expect(owner.error).toBeNull();
 const teacherId=owner.data!.id as string;
 expect((await admin.from("teacher_settings").upsert({teacher_id:teacherId,timezone:"UTC",currency:"USD"})).error).toBeNull();
 const run=async(name:string,args:Record<string,unknown>)=>{
  const result=await call(name,args);expect(result.error).toBeUndefined();return result.data;
 };
 const idem=()=>({idempotencyKey:randomUUID()});
 const key=()=>({...idem(),confirmed:true});
 const makeStudent=async()=> (await run("ccp_students_create",{name:"Synthetic purchase student "+randomUUID(),...idem()})).entityId as string;
 const studentId=await makeStudent(),otherStudent=await makeStudent();
 const makeVenue=async()=> (await run("ccp_workplaces_create",{name:"Purchase workplace "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{},...idem()})).entityId as string;
 const workplaceId=await makeVenue(),otherVenue=await makeVenue();
 for(const [learner,venue] of [[studentId,workplaceId],[otherStudent,workplaceId],[studentId,otherVenue]])
  await run("ccp_workplaces_enroll",{studentId:learner,workplaceId:venue,...idem()});
 const contact=await run("ccp_contacts_create",{displayName:"Synthetic sponsor "+randomUUID(),...key()});
 const contactId=contact.id as string;
 await run("ccp_student_contacts_link",{studentId,contactId,relationshipLabel:"Sponsor",...key()});
 const account=async()=> (await run("ccp_billing_accounts_create",{displayName:"Synthetic payer "+randomUUID(),
  accountKind:"organization",...key()})).id as string;
 const payer=await account(),otherPayer=await account();
 const assign=async(studentId:string,workplaceId:string,billingAccountId:string,effectiveFrom:string,effectiveTo:string|null=null)=>
  run("ccp_student_billing_assignments_create",{studentId,workplaceId,billingAccountId,effectiveFrom,effectiveTo,...key()});
 await assign(studentId,workplaceId,payer,"2040-01-01","2040-01-05");
 await assign(studentId,workplaceId,otherPayer,"2040-01-06");
 await assign(otherStudent,workplaceId,payer,"2040-01-01");
 await assign(studentId,otherVenue,payer,"2040-01-01");
 const invoiceIds:string[]=[];
 const purchase=async(studentId:string,workplaceId:string,priceCents:number,startsOn:string)=>{
  const got=await run("ccp_credits_package_create",{studentId,workplaceId,credits:17,durationMinutes:45,
   priceCents,startsOn,expiresOn:"2042-01-01",requestId:randomUUID(),confirmed:true});
  invoiceIds.push(got.invoiceId);
  return got.invoiceId as string;
 };
 const issuedStatus=async(id:string)=>expect((await admin.from("invoices").update({status:"sent",sent_at:new Date().toISOString()})
  .eq("teacher_id",teacherId).eq("id",id)).error).toBeNull();
 const guest=await playwright.request.newContext({baseURL:origin});
 try{
  const wanted=await purchase(studentId,workplaceId,3718,"2040-01-02");
  const wrongPayer=await purchase(studentId,workplaceId,4829,"2040-01-06");
  const wrongChild=await purchase(otherStudent,workplaceId,5937,"2040-01-02");
  const wrongVenue=await purchase(studentId,otherVenue,6043,"2040-01-02");
  await purchase(studentId,workplaceId,7152,"2040-01-03"); // Draft stays private.
  const mixed=await purchase(studentId,workplaceId,8261,"2040-01-04");
  expect((await admin.from("invoice_items").insert({invoice_id:mixed,kind:"lesson",
   description:"Synthetic unresolved mixed-history marker",quantity:1,unit_cents:0,amount_cents:0,sort_order:1})).error).toBeNull();
  const missing=await admin.from("invoices").insert({teacher_id:teacherId,billing_account_id:payer,
   period_start:"2040-01-05",period_end:"2040-01-05",status:"draft",subtotal_cents:9374,currency:"USD"})
   .select("id").single();
  expect(missing.error).toBeNull();
  invoiceIds.push(missing.data!.id);
  expect((await admin.from("invoice_items").insert({invoice_id:missing.data!.id,kind:"credit_package",
   description:"Synthetic package evidence absent",quantity:1,unit_cents:9374,amount_cents:9374})).error).toBeNull();
  for(const id of [wanted,wrongPayer,wrongChild,wrongVenue,mixed,missing.data!.id])await issuedStatus(id);
  const grant=await run("ccp_portal_grants_create",{studentId,workplaceId,contactId,billingAccountId:payer,
   permissions:["finance"],expiresAt:future(2),...key()});
  const issued=await page.request.post("/api/portal-grants/"+grant.id+"/issue",{
   headers:{origin},data:{expectedRevision:1,confirmed:true},
  });
  expect(issued.status()).toBe(200);
  const path=new URL((await issued.json()).url).pathname;
  const response=await guest.get(path);
  expect(response.status()).toBe(200);
  const html=await response.text();
  expect(html).toContain("Prepaid lesson purchase");
  expect(html).toContain("$37.18");
  for(const amount of ["48.29","59.37","60.43","71.52","82.61","93.74"])expect(html).not.toContain(amount);
  expect(html).not.toMatch(/2042-01-01|Prepaid 17 ×|payment.?notes|pay\.stripe\.com/i);
  const audience=async(role:string,venue:string,permissions:string[])=>{
   const related=await run("ccp_contacts_create",{displayName:role+" "+randomUUID(),...key()});
   const relation=await run("ccp_student_contacts_link",{studentId,contactId:related.id,
    relationshipLabel:role,...key()});
   const scoped=await run("ccp_portal_grants_create",{studentId,contactId:related.id,
    workplaceId:venue,permissions,expiresAt:future(2),...key()});
   const response=await page.request.post("/api/portal-grants/"+scoped.id+"/issue",{
    headers:{origin},data:{expectedRevision:1,confirmed:true},
   });
   expect(response.status()).toBe(200);
   return {path:new URL((await response.json()).url).pathname,contact:related,link:relation,grant:scoped};
  };
  const schoolGuest=await audience("School liaison",workplaceId,["calendar","event_rsvp"]);
  const mother=await audience("Mother",otherVenue,["calendar"]);
  const titles={school:"School calendar "+randomUUID(),private:"Private calendar "+randomUUID(),
   event:"School event "+randomUUID()};
  const sessions=[];
  for(const [venue,title,days,durationMinutes] of [[workplaceId,titles.school,3,45],[otherVenue,titles.private,4,50]] as const){
   sessions.push(await run("ccp_sessions_create",{studentId,workplaceId:venue,title,
    startsAt:future(days),durationMinutes,...idem()}));
  }
  const event=await run("ccp_events_create",{title:titles.event,workplaceId,
   startsAt:future(5),studentIds:[studentId],...key()});
  await run("ccp_events_portal_invitations_create",{eventId:event.event.id,portalGrantId:schoolGuest.grant.id,...key()});
  const title=(body:string)=>body.match(/<title>([^<]*)<\/title>/i)?.[1];
  const neutralTitle="ChessCoachPal - Student and Contact Portal";
  const read=async(url:string,allowed:string[],forbidden:string[])=>{
   const response=await guest.get(url);
   expect(response.status()).toBe(200);
   const body=await response.text();
   expect(title(body)).toBe(neutralTitle);
   expect(title(body)).not.toContain("Family Portal");
   for(const value of allowed)expect(body.includes(value),"authorized resource renders").toBe(true);
   for(const value of forbidden)expect(body.includes(value),"unapproved resource stays private").toBe(false);
  };
  await read(schoolGuest.path,[schoolGuest.contact.displayName,titles.event],["$37.18"]);
  await read(mother.path,[mother.contact.displayName],[titles.event,"$37.18"]);
  await read(path,["$37.18","Prepaid lesson purchase"],[titles.event,schoolGuest.contact.displayName,mother.contact.displayName]);
  const schoolIcs=await guest.get("/api"+schoolGuest.path+"/calendar");
  expect(schoolIcs.status()).toBe(200);
  expect(schoolIcs.headers()["cache-control"]).toContain("no-store");
  expect(schoolIcs.headers()["referrer-policy"]).toBe("no-referrer");
  const schoolFeed=await schoolIcs.text();
  expect(schoolFeed).toContain(sessions[0].entityId);
  expect(schoolFeed).not.toContain(sessions[1].entityId);
  const motherIcs=await guest.get("/api"+mother.path+"/calendar");
  expect(motherIcs.status()).toBe(200);
  const motherFeed=await motherIcs.text();
  expect(motherFeed).toContain(sessions[1].entityId);
  expect(motherFeed).not.toContain(sessions[0].entityId);
  const rsvp=await guest.post("/api"+schoolGuest.path+"/events/"+event.event.id+"/rsvp",{
   data:{status:"yes",partySize:1,note:""},
  });
  expect(rsvp.status()).toBe(200);
  expect(await rsvp.json()).toMatchObject({ok:true,replayed:false});
  expect(rsvp.headers()["cache-control"]).toContain("no-store");
  expect(rsvp.headers()["referrer-policy"]).toBe("no-referrer");
  const unlink=await run("ccp_student_contacts_unlink",{studentId,linkId:schoolGuest.link.id,
   expectedRevision:schoolGuest.link.revision,...key()});
  expect(unlink.activeTo).toBeTruthy();
  const unlinkedBody=await (await guest.get(schoolGuest.path)).text();
  expect(unlinkedBody.includes(titles.event)).toBe(false);
  expect(title(unlinkedBody)).toBe(neutralTitle);
  expect((await guest.get("/api"+schoolGuest.path+"/calendar")).status()).toBe(404);
  await run("ccp_contacts_update",{contactId:mother.contact.id,status:"archived",
   expectedRevision:mother.contact.revision,...key()});
  expect((await (await guest.get(mother.path)).text()).includes(mother.contact.displayName)).toBe(false);
  expect((await guest.get("/api"+mother.path+"/calendar")).status()).toBe(404);
  await read(path,["$37.18"],[titles.event,schoolGuest.contact.displayName,mother.contact.displayName]);
  // Keep fixture session history without leaving open future lessons that
  // intentionally block the independent learner-archive assertion.
  for(const lesson of sessions){
   const live=await admin.from("teaching_sessions").select("updated_at")
    .eq("teacher_id",teacherId).eq("id",lesson.entityId).single();
   expect(live.error).toBeNull();
   await run("ccp_sessions_cancel",{sessionId:lesson.entityId,expectedUpdatedAt:live.data!.updated_at,...key()});
  }
  const lifecycle=await run("ccp_students_lifecycle_preview",{studentId});
  expect(lifecycle.canArchive).toBe(true);
  await run("ccp_students_lifecycle_commit",{studentId,mode:"archive",
   expectedUpdatedAt:lifecycle.expectedUpdatedAt,selectedWorkplaceIds:[],requestId:randomUUID(),
   reason:"Synthetic archived learner retains private purchase record",confirmed:true});
  expect(await (await guest.get(path)).text()).not.toContain("$37.18");
  const retained=await admin.from("credit_packages").select("invoice_id").eq("teacher_id",teacherId).eq("invoice_id",wanted).single();
  expect(retained.data?.invoice_id).toBe(wanted);
 }finally{
  await guest.dispose();
  if(invoiceIds.length){
   expect((await admin.from("credit_packages").delete().eq("teacher_id",teacherId).in("invoice_id",invoiceIds)).error).toBeNull();
   expect((await admin.from("invoices").update({status:"void"}).eq("teacher_id",teacherId)
    .in("id",invoiceIds).eq("status","sent")).error).toBeNull();
   expect((await admin.from("invoices").delete().eq("teacher_id",teacherId).in("id",invoiceIds)).error).toBeNull();
  }
 }
});
