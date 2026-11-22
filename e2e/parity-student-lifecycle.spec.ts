import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {createAssignedPayer} from "./helpers/canonical-payer";

test("PARITY:PARITY-student-lifecycle archives all dated memberships atomically and restores selected history without changing credits",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const learner=await call("ccp_students_create",{
  name:"Temporal archive learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const places:string[]=[];
 for(let i=0;i<2;i++){
  const place=await call("ccp_workplaces_create",{
   name:"Historic campus "+randomUUID(),timezone:"UTC",currency:"USD",
   locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(place.error).toBeUndefined();
  places.push(place.data.entityId as string);
  expect((await call("ccp_workplaces_enroll",{
   workplaceId:places[i],studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 }
 await createAssignedPayer(call,{
  studentId,workplaceId:places[0],effectiveFrom:"2040-01-01",
 });
 const purchased=await call("ccp_credits_package_create",{
  studentId,workplaceId:places[0],credits:3,durationMinutes:45,
  priceCents:7500,startsOn:"2042-01-01",expiresOn:"2042-12-31",
  requestId:randomUUID(),confirmed:true,
 });
 expect(purchased.error).toBeUndefined();
 const packageId=purchased.data.packageId as string;
 const websitePreview=await page.request.post("/api/agent/v1",{
  data:{action:"students.lifecyclePreview",studentId},
 });
 expect(websitePreview.status(),await websitePreview.text()).toBe(200);
 const before=(await websitePreview.json()).data;
 const mcpPreview=await call("ccp_students_lifecycle_preview",{studentId});
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data).toEqual(before);
 expect(before).toMatchObject({
  archived:false,canArchive:true,creditPolicy:"hold_without_refund_transfer_or_expiry_change",
 });
 expect(before.currentMemberships).toHaveLength(2);
 expect(before.creditPackages).toHaveLength(1);
 expect(before.creditPackages[0]).toMatchObject({
  packageId,purchasedCredits:3,redeemedCredits:0,adjustmentCredits:0,
  invoiceStatus:"draft",
 });
 const endArgs={
  studentId,mode:"archive",expectedUpdatedAt:before.expectedUpdatedAt,
  selectedWorkplaceIds:[],requestId:randomUUID(),confirmed:true,
  reason:"Teacher reviewed commitments and retained all outstanding lesson entitlements",
 };
 const ended=await page.request.post("/api/agent/v1",{
  data:{action:"students.lifecycleCommit",...endArgs},
 });
 expect(ended.status(),await ended.text()).toBe(200);
 const endedBody=(await ended.json()).data;
 expect(endedBody).toMatchObject({
  archived:true,closedPeriods:0,cancelledPeriods:2,replayed:false,
 });
 const retry=await call("ccp_students_lifecycle_commit",endArgs);
 expect(retry.error).toBeUndefined();
 expect(retry.data).toMatchObject({archived:true,replayed:true});
 const changed=await call("ccp_students_lifecycle_commit",{
  ...endArgs,reason:"Changed terms must never rewrite a confirmed archived lifecycle",
 });
 expect(changed.error?.code).toBe("CONFLICT");
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const archiveRows=await admin.from("workplace_enrollments")
  .select("teacher_id,workplace_id,ends_on,cancelled_at")
  .eq("student_id",studentId);
 expect(archiveRows.error).toBeNull();
 expect(archiveRows.data).toHaveLength(2);
 expect(archiveRows.data!.every(x=>x.cancelled_at!==null)).toBe(true);
 // A direct SQL or racing browser enrollment cannot silently bypass archive:
 // tenant-scoped foreign keys alone do not protect lifecycle state.
 const bypass=await admin.from("workplace_enrollments").insert({
  teacher_id:archiveRows.data![0]?.teacher_id??undefined,
  workplace_id:places[0],student_id:studentId,source:"manual",
 });
 expect(bypass.error?.message).toContain("ARCHIVED_STUDENT_ENROLLMENT");

 const held=await call("ccp_credits_packages_list",{studentId});
 expect(held.error).toBeUndefined();
 expect(held.data.packages.find((x:{id:string})=>x.id===packageId))
  .toMatchObject({credits:3,usedCredits:0});
 const reopen=await call("ccp_students_lifecycle_preview",{studentId});
 expect(reopen.error).toBeUndefined();
 expect(reopen.data).toMatchObject({archived:true,canReactivate:true});
 expect(reopen.data.previousWorkplaceIds.sort()).toEqual([...places].sort());
 const restoreArgs={
  studentId,mode:"reactivate",
  expectedUpdatedAt:reopen.data.expectedUpdatedAt,
  selectedWorkplaceIds:[places[0]],requestId:randomUUID(),
  reason:"Teacher explicitly reactivates the learner at one previously verified workplace",
  confirmed:true,
 };
 const restore=await page.request.post("/api/agent/v1",{
  data:{action:"students.lifecycleCommit",...restoreArgs},
 });
 expect(restore.status(),await restore.text()).toBe(200);
 expect((await restore.json()).data).toMatchObject({
  archived:false,restoredWorkplaces:[places[0]],replayed:false,
 });
 const restoreReplay=await call("ccp_students_lifecycle_commit",restoreArgs);
 expect(restoreReplay.error).toBeUndefined();
 expect(restoreReplay.data.replayed).toBe(true);
 const current=await call("ccp_workplaces_enrollments",{workplaceId:places[0]});
 expect(current.error).toBeUndefined();
 expect(current.data).toEqual(expect.arrayContaining([{student_id:studentId}]));
 const other=await call("ccp_workplaces_enrollments",{workplaceId:places[1]});
 expect(other.error).toBeUndefined();
 expect(other.data.some((x:{student_id:string})=>x.student_id===studentId)).toBe(false);
 const periods=await admin.from("workplace_enrollments")
  .select("workplace_id,starts_on,ends_on,cancelled_at")
  .eq("student_id",studentId);
 expect(periods.error).toBeNull();
 expect(periods.data).toHaveLength(3);
 expect(periods.data!.filter(x=>x.workplace_id===places[0])).toHaveLength(2);
 const after=await call("ccp_credits_packages_list",{studentId});
 expect(after.error).toBeUndefined();
 expect(after.data.packages.find((x:{id:string})=>x.id===packageId)?.usedCredits)
  .toBe(0);
 const foreign=await call("ccp_students_lifecycle_preview",{studentId:randomUUID()});
 expect(foreign.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-expired-funded-credit-hold is owner-only and preserves financial evidence",async({
 page,request,browser,baseURL,
})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const identities:string[]=[];
 const makeTeacher=async(label:string)=>{
  const email="credit-hold-"+randomUUID()+"@example.com";
  const password="Synthetic-CreditHold-123!";
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(error).toBeNull();
  const id=data.user!.id;
  identities.push(id);
  expect((await admin.from("teachers").insert({
   id,email,display_name:label,onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  return {id,email,password};
 };
 const otherContext=await browser.newContext({baseURL});
 try{
  const owner=await makeTeacher("Synthetic expired-credit owner");
  const other=await makeTeacher("Synthetic neighboring teacher");
  const owned=await delegatedTool(page,request,"coach:read coach:write",owner);
  const otherPage=await otherContext.newPage();
  const neighboring=await delegatedTool(otherPage,request,"coach:read coach:write",other);
  const learner=await owned("ccp_students_create",{
   name:"Expired credit learner "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(learner.error).toBeUndefined();
  const studentId=learner.data.entityId as string;
  const workplace=await owned("ccp_workplaces_create",{
   name:"Expired credit campus "+randomUUID(),timezone:"UTC",currency:"USD",
   locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(workplace.error).toBeUndefined();
  const workplaceId=workplace.data.entityId as string;
  // Record an actual historical enrollment rather than creating a current
  // enrollment and backdating a purchase outside its verified interval.
  const startsOn="2020-01-01",expiresOn="2020-02-01",priceCents=7500;
  const period=await admin.from("workplace_enrollments").insert({
   teacher_id:owner.id,workplace_id:workplaceId,student_id:studentId,
   starts_on:startsOn,source:"manual",
  });
  expect(period.error).toBeNull();
  const {billingAccountId}=await createAssignedPayer(owned,{
   studentId,workplaceId,effectiveFrom:startsOn,
  });
  const packageResult=await owned("ccp_credits_package_create",{
   studentId,workplaceId,credits:3,durationMinutes:45,priceCents,
   startsOn,expiresOn,requestId:randomUUID(),confirmed:true,
  });
  expect(packageResult.error).toBeUndefined();
  const {packageId,invoiceId}=packageResult.data as {packageId:string;invoiceId:string};
  // Model one already recorded synthetic manual receipt, not a new cash
  // transaction performed by the lifecycle operation being tested.
  const funding=await admin.from("payments").insert({
   invoice_id:invoiceId,amount_cents:priceCents,method:"manual",
   recorded_at:"2020-01-01T12:00:00Z",
  });
  expect(funding.error).toBeNull();
  const paid=await admin.from("invoices").update({
   status:"paid",paid_at:"2020-01-01T12:00:00Z",payment_method:"manual",
  }).eq("teacher_id",owner.id).eq("id",invoiceId);
  expect(paid.error).toBeNull();
  const financialSnapshot=async()=>{
   const [packageRow,receipt,invoice,adjustments,reversals]=await Promise.all([
    admin.from("credit_packages").select("id,student_id,workplace_id,invoice_id,credits,starts_on,expires_on,price_cents")
     .eq("teacher_id",owner.id).eq("id",packageId).single(),
    admin.from("payments").select("id,amount_cents,method,recorded_at").eq("invoice_id",invoiceId),
    admin.from("invoices").select("id,status,billing_account_id,subtotal_cents,paid_at")
     .eq("teacher_id",owner.id).eq("id",invoiceId).single(),
    admin.from("credit_adjustment_events").select("id").eq("teacher_id",owner.id).eq("package_id",packageId),
    admin.from("financial_reversals").select("id").eq("teacher_id",owner.id),
   ]);
   for(const row of [packageRow,receipt,invoice,adjustments,reversals])expect(row.error).toBeNull();
   return {package:packageRow.data,receipt:receipt.data,invoice:invoice.data,
    adjustments:adjustments.data,reversals:reversals.data};
  };
  const financialBefore=await financialSnapshot();
  expect(financialBefore).toMatchObject({
   package:{id:packageId,student_id:studentId,workplace_id:workplaceId,credits:3,expires_on:expiresOn},
   receipt:[{amount_cents:priceCents,method:"manual"}],
   invoice:{status:"paid",billing_account_id:billingAccountId,subtotal_cents:priceCents},
   adjustments:[],reversals:[],
  });
  const previewArgs={action:"students.lifecyclePreview",studentId};
  const preview=await page.request.post("/api/agent/v1",{data:previewArgs});
  expect(preview.status(),await preview.text()).toBe(200);
  const before=(await preview.json()).data;
  expect(before.teacherLocalToday>expiresOn).toBe(true);
  expect(before).toMatchObject({
   studentId,archived:false,canArchive:true,
   creditPolicy:"hold_without_refund_transfer_or_expiry_change",
   creditPackages:[{packageId,invoiceId,invoiceStatus:"paid",expiresOn,purchasedCredits:3,
    redeemedCredits:0,adjustmentCredits:0,recordedLegacyInvoicePaymentsCents:priceCents}],
  });
  expect((await owned("ccp_students_lifecycle_preview",{studentId})).data).toEqual(before);
  const commit={studentId,mode:"archive",expectedUpdatedAt:before.expectedUpdatedAt,
   selectedWorkplaceIds:[],requestId:randomUUID(),confirmed:true,
   reason:"Teacher reviewed expired prepaid credit and kept original financial evidence"};
  const deniedPreview=await otherPage.request.post("/api/agent/v1",{data:previewArgs});
  expect(deniedPreview.status()).toBe(404);
  const mcpDeniedPreview=await neighboring("ccp_students_lifecycle_preview",{studentId});
  expect(mcpDeniedPreview).toEqual(await deniedPreview.json());
  expect(mcpDeniedPreview.error?.code).toBe("NOT_FOUND");
  const deniedCommit=await otherPage.request.post("/api/agent/v1",{
   data:{action:"students.lifecycleCommit",...commit},
  });
  expect(deniedCommit.status()).toBe(404);
  const mcpDeniedCommit=await neighboring("ccp_students_lifecycle_commit",commit);
  expect(mcpDeniedCommit).toEqual(await deniedCommit.json());
  expect(mcpDeniedCommit.error?.code).toBe("NOT_FOUND");
  const deniedLedger=await admin.from("agent_tool_receipts").select("teacher_id")
   .eq("idempotency_key",commit.requestId);
  expect(deniedLedger.error).toBeNull();
  expect(deniedLedger.data).toEqual([]);
  const stillOwned=await owned("ccp_students_lifecycle_preview",{studentId});
  expect(stillOwned.error).toBeUndefined();
  expect(stillOwned.data).toMatchObject({archived:false,expectedUpdatedAt:before.expectedUpdatedAt});

  const archived=await owned("ccp_students_lifecycle_commit",commit);
  expect(archived.error).toBeUndefined();
  expect(archived.data).toMatchObject({archived:true,replayed:false,closedPeriods:1});
  const retry=await page.request.post("/api/agent/v1",{
   data:{action:"students.lifecycleCommit",...commit},
  });
  expect(retry.status(),await retry.text()).toBe(200);
  expect((await retry.json()).data).toEqual({...archived.data,replayed:true});
  const ownerAfter=await page.request.post("/api/agent/v1",{data:previewArgs});
  expect(ownerAfter.status(),await ownerAfter.text()).toBe(200);
  expect((await ownerAfter.json()).data).toMatchObject({
   archived:true,creditPackages:before.creditPackages,creditPolicy:before.creditPolicy,
  });
  expect(await financialSnapshot()).toEqual(financialBefore);
  const ownerLedger=await admin.from("agent_tool_receipts").select("teacher_id,operation")
   .eq("idempotency_key",commit.requestId);
  expect(ownerLedger.error).toBeNull();
  expect(ownerLedger.data).toEqual([{teacher_id:owner.id,operation:"student.lifecycle"}]);
 }finally{
  await otherContext.close();
  for(const id of identities.reverse())expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
