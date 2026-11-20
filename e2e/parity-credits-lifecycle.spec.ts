import {insertTestBillingAccount} from "./helpers/canonical-payer";
import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";
import {createAssignedPayer} from "./helpers/canonical-payer";

test("PARITY:PARITY-credits-full-lifecycle creates, adjusts, redeems and returns credits on both surfaces",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_students_create",{
   name:"Prepaid chess pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const location=await call("ccp_workplaces_create",{
   name:"Prepaid package workplace "+randomUUID(),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(location.error).toBeUndefined();
 const workplaceId=location.data.entityId as string;
 expect((await call("ccp_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 await createAssignedPayer(call,{
   studentId,workplaceId,effectiveFrom:"2040-01-01",
 });
 const payload={
   studentId,workplaceId,credits:2,durationMinutes:45,priceCents:9000,
   startsOn:"2042-07-01",expiresOn:"2042-08-01",
 };
 const requestId=randomUUID();
 const made=await call("ccp_credits_package_create",{
   ...payload,requestId,confirmed:true,
 });
 expect(made.error).toBeUndefined();
 expect(made.data.replayed).toBe(false);
 const packageId=made.data.packageId as string;
 const invoiceId=made.data.invoiceId as string;
 const replay=await call("ccp_credits_package_create",{
   ...payload,requestId,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({packageId,invoiceId,replayed:true});
 const conflict=await call("ccp_credits_package_create",{
   ...payload,priceCents:9900,requestId,confirmed:true,
 });
 expect(conflict.error?.code).toBe("CONFLICT");
 const browserRequestId=randomUUID();
 const browserCreate=await page.request.post("/api/billing/credit-packages",{
   data:{...payload,requestId:browserRequestId},
 });
 expect(browserCreate.status(),await browserCreate.text()).toBe(200);
 const browserProduct=await browserCreate.json();
 expect(browserProduct.replayed).toBe(false);
 const browserReplay=await page.request.post("/api/billing/credit-packages",{
   data:{...payload,requestId:browserRequestId},
 });
 expect(browserReplay.status(),await browserReplay.text()).toBe(200);
 expect(await browserReplay.json()).toMatchObject({
   packageId:browserProduct.packageId,invoiceId:browserProduct.invoiceId,replayed:true,
 });
 const website=await page.request.get("/api/billing/credit-packages?studentId="+studentId);
 expect(website.status(),await website.text()).toBe(200);
 const initial=(await website.json()).packages as Array<{id:string;invoiceStatus:string}>;
 expect(initial.find(x=>x.id===packageId)?.invoiceStatus).toBe("draft");
 const mcpInitial=await call("ccp_credits_packages_list",{studentId});
 expect(mcpInitial.error).toBeUndefined();
 expect(mcpInitial.data.packages).toEqual(initial);
 const initialPreview=await call("ccp_credits_adjustment_preview",{packageId});
 expect(initialPreview.error).toBeUndefined();
 expect(initialPreview.data.availableCredits).toBe(2);
 const websiteExpiryRequest={
   expiresOn:"2042-08-31",expectedBalance:2,
   reason:"Teacher approved a longer validity period",requestId:randomUUID(),confirmed:true,
 };
 const unreviewed=await page.request.patch("/api/billing/credit-packages/"+packageId,{
   data:{expiresOn:"2042-08-31"},
 });
 expect(unreviewed.status()).toBe(400);
 const changed=await page.request.patch("/api/billing/credit-packages/"+packageId,{
   data:websiteExpiryRequest,
 });
 expect(changed.status(),await changed.text()).toBe(200);
 expect((await changed.json()).kind).toBe("expiry_extension");
 const updated=await call("ccp_credits_packages_list",{studentId});
 expect(updated.error).toBeUndefined();
 expect(updated.data.packages.find((x:{id:string})=>x.id===packageId).expiresOn)
   .toBe("2042-08-31");
 const modelExpiryRequest={
   packageId,expiresOn:"2042-09-30",expectedBalance:2,
   reason:"Teacher reviewed a second credit extension",
   requestId:randomUUID(),confirmed:true,
 };
 const later=await call("ccp_credits_package_expiry",modelExpiryRequest);
 expect(later.error).toBeUndefined();
 const expiryReplay=await page.request.patch("/api/billing/credit-packages/"+packageId,{
   data:{expiresOn:modelExpiryRequest.expiresOn,
    expectedBalance:modelExpiryRequest.expectedBalance,reason:modelExpiryRequest.reason,
    requestId:modelExpiryRequest.requestId,confirmed:true},
 });
 expect(expiryReplay.status(),await expiryReplay.text()).toBe(200);
 expect((await expiryReplay.json()).replayed).toBe(true);
 const webLater=await page.request.get("/api/billing/credit-packages?studentId="+studentId);
 expect(webLater.status(),await webLater.text()).toBe(200);
 expect((await webLater.json()).packages.find((x:{id:string})=>x.id===packageId).expiresOn)
   .toBe("2042-09-30");

 // The purchase invoice must be sent/paid before a credit can cover teaching.
 // Synthetic database transition avoids sending a real email in CI.
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const signed=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(signed.error).toBeNull();
 const {error:activateError}=await admin.from("invoices").update({status:"sent"})
   .eq("id",invoiceId).eq("teacher_id",signed.data.user!.id);
 expect(activateError).toBeNull();
 const countBefore=await admin.from("invoices").select("id",{head:true,count:"exact"})
   .eq("teacher_id",signed.data.user!.id);
 expect(countBefore.error).toBeNull();
 const rejected=await page.request.post("/api/billing/credit-packages",{
   data:{...payload,studentId:randomUUID(),requestId:randomUUID()},
 });
 expect(rejected.status(),await rejected.text()).toBe(404);
 const countAfter=await admin.from("invoices").select("id",{head:true,count:"exact"})
   .eq("teacher_id",signed.data.user!.id);
 expect(countAfter.error).toBeNull();
 expect(countAfter.count).toBe(countBefore.count);

 const lesson=await call("ccp_sessions_create",{
   workplaceId,studentId,title:"Prepaid private coaching",
   startsAt:"2042-07-10T10:00:00Z",durationMinutes:45,
   lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(lesson.error).toBeUndefined();
 const sessionId=lesson.data.entityId as string;
 const attended=await call("ccp_session_attendance_set",{
   sessionId,studentId,status:"present",note:"",
   noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
   notifyFamily:false,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(attended.error).toBeUndefined();
 const preview=await page.request.post("/api/billing/generate",{
   data:{periodStart:"2042-07-01",periodEnd:"2042-07-31",commit:false},
 });
 expect(preview.status(),await preview.text()).toBe(200);
 expect((await preview.json()).creditsToUse).toBe(1);
 const mcpPreview=await call("ccp_billing_generation_preview",{
   periodStart:"2042-07-01",periodEnd:"2042-07-31",
 });
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data.creditsToUse).toBe(1);
 const applied=await page.request.post("/api/billing/generate",{
   data:{periodStart:"2042-07-01",periodEnd:"2042-07-31",commit:true},
 });
 expect(applied.status(),await applied.text()).toBe(200);
 expect((await applied.json()).creditsUsed).toBe(1);
 const read=await call("ccp_credits_packages_list",{studentId});
 expect(read.error).toBeUndefined();
 const pkg=read.data.packages.find((x:{id:string})=>x.id===packageId);
 expect(pkg.usedCredits).toBe(1);
 expect(pkg.redemptions).toHaveLength(1);
 const siteUsed=await page.request.get("/api/billing/credit-packages?studentId="+studentId);
 expect(siteUsed.status(),await siteUsed.text()).toBe(200);
 expect(read.data.packages).toEqual((await siteUsed.json()).packages);
 const wrongExpiry=await page.request.patch("/api/billing/credit-packages/"+packageId,{
   data:{expiresOn:"2042-07-09",expectedBalance:1,
    reason:"Attempting an invalid expiry shortening",requestId:randomUUID(),confirmed:true},
 });
 expect(wrongExpiry.status()).toBe(409);
 const mcpWrongExpiry=await call("ccp_credits_package_expiry",{
   packageId,expiresOn:"2042-07-09",expectedBalance:1,
   reason:"Attempting an invalid expiry shortening",requestId:randomUUID(),confirmed:true,
 });
 expect(mcpWrongExpiry.error?.code).toBe("CONFLICT");
 // Database-level invariant also rejects direct or concurrently racing
 // expiry edits, not just the preflight in the website/MCP service.
 // A direct *extension* would have been allowed by the historical guard;
 // the reviewed-only database trigger must reject it without a ledger event.
 const directExtension=await admin.from("credit_packages")
   .update({expires_on:"2043-06-01"}).eq("id",packageId);
 expect(directExtension.error?.message).toContain("CREDIT_EXPIRY_REVIEW_REQUIRED");
 // Shortening is also rejected, possibly by the earlier history guard first.
 const directViolation=await admin.from("credit_packages")
   .update({expires_on:"2042-07-09"}).eq("id",packageId);
 expect(directViolation.error?.message).toMatch(
   /CREDIT_EXPIRY_(REVIEW_REQUIRED|HISTORY_CONFLICT)/);
 const afterDenied=await admin.from("credit_packages").select("expires_on")
   .eq("id",packageId).single();
 expect(afterDenied.error).toBeNull();
 expect(afterDenied.data?.expires_on).toBe("2042-09-30");

 // A separate authenticated teacher cannot delete another coach's redeemed
 // lesson or read a successful-return receipt. The RPC derives auth.uid().
 const foreignEmail="foreign-credit-"+randomUUID()+"@example.com";
 const foreignUser=await admin.auth.admin.createUser({
   email:foreignEmail,password:"SyntheticForeignCredit-123!",email_confirm:true,
 });
 expect(foreignUser.error).toBeNull();
 const foreignId=foreignUser.data.user!.id;
 try {
   const otherTeacher=await admin.from("teachers").insert({
     id:foreignId,email:foreignEmail,display_name:"Foreign credit coach",
   });
   expect(otherTeacher.error).toBeNull();
   const foreignClient=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
     auth:{persistSession:false,autoRefreshToken:false},
   });
   const foreignLogin=await foreignClient.auth.signInWithPassword({
     email:foreignEmail,password:"SyntheticForeignCredit-123!",
   });
   expect(foreignLogin.error).toBeNull();
   const foreignReturn=await foreignClient.rpc("ccp_credit_redemption_return",{
     p_redemption_id:pkg.redemptions[0].id,
   });
   expect(foreignReturn.data).toBeNull();
   expect(foreignReturn.error?.message).toContain("NOT_FOUND");
   const stillUsed=await page.request.get("/api/billing/credit-packages?studentId="+studentId);
   expect(stillUsed.status(),await stillUsed.text()).toBe(200);
   expect((await stillUsed.json()).packages.find((x:{id:string})=>x.id===packageId).usedCredits)
     .toBe(1);
 } finally {
   expect((await admin.auth.admin.deleteUser(foreignId)).error).toBeNull();
 }
 // Race the FIRST website and MCP return: SQL must commit one deletion and
 // one replay receipt, not permit lost writes or fail the losing request.
 const [returned,browserFirst]=await Promise.all([
   call("ccp_credits_redemption_return",{
     redemptionId:pkg.redemptions[0].id,confirmed:true,
   }),
   page.request.delete("/api/billing/credit-redemptions/"+pkg.redemptions[0].id),
 ]);
 expect(returned.error).toBeUndefined();
 expect(browserFirst.status(),await browserFirst.text()).toBe(200);
 const browserResult=await browserFirst.json();
 expect([returned.data.replayed,browserResult.replayed].sort())
   .toEqual([false,true]);
 expect(returned.data.ok).toBe(true);
 expect(browserResult.ok).toBe(true);
 const afterReturn=await page.request.get("/api/billing/credit-packages?studentId="+studentId);
 expect(afterReturn.status(),await afterReturn.text()).toBe(200);
 const restored=(await afterReturn.json()).packages.find((x:{id:string})=>x.id===packageId);
 expect(restored.usedCredits).toBe(0);
 expect(restored.redemptions).toHaveLength(0);
 // Website retry of a successful MCP return MUST not claim an unknown ID or
 // apply a second financial mutation. Receipt survives in the same SQL tx.
 const browserRetry=await page.request.delete(
   "/api/billing/credit-redemptions/"+pkg.redemptions[0].id);
 expect(browserRetry.status(),await browserRetry.text()).toBe(200);
 expect(await browserRetry.json()).toEqual({ok:true,replayed:true});
 const modelRetry=await call("ccp_credits_redemption_return",{
   redemptionId:pkg.redemptions[0].id,confirmed:true,
 });
 expect(modelRetry.error).toBeUndefined();
 expect(modelRetry.data).toEqual({ok:true,replayed:true});
 const noForeignReceipt=await call("ccp_credits_redemption_return",{
   redemptionId:randomUUID(),confirmed:true,
 });
 expect(noForeignReceipt.error?.code).toBe("NOT_FOUND");
 const afterReplay=await page.request.get("/api/billing/credit-packages?studentId="+studentId);
 expect(afterReplay.status(),await afterReplay.text()).toBe(200);
 expect((await afterReplay.json()).packages.find((x:{id:string})=>x.id===packageId).usedCredits)
   .toBe(0);
});

test("PARITY:PARITY-credits-tenant-scope denies foreign package reads creates and expiry edits",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="foreign-credits-"+randomUUID()+"@example.com";
 const account=await admin.auth.admin.createUser({
  email,password:"SyntheticOtherCoach-123!",email_confirm:true,
 });
 expect(account.error).toBeNull();
 const teacherId=account.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Foreign prepaid credit coach",
  })).error).toBeNull();
  const family=await insertTestBillingAccount(admin,{teacherId:teacherId,displayName:"Private family"});
  expect(family.error).toBeNull();
  const student=await admin.from("students").insert({
   teacher_id:teacherId,name:"Foreign chess pupil",
  }).select("id").single();
  expect(student.error).toBeNull();
  const foreignStudentId=student.data!.id as string;
  const place=await admin.from("workplaces").insert({
    teacher_id:teacherId,name:"Foreign private workplace "+randomUUID(),
    timezone:"UTC",currency:"USD",locale:"en",policy:{},
  }).select("id").single();
  expect(place.error).toBeNull();
  const foreignWorkplaceId=place.data!.id as string;
  expect((await admin.from("workplace_enrollments").insert({
    teacher_id:teacherId,student_id:foreignStudentId,workplace_id:foreignWorkplaceId,
  })).error).toBeNull();
  expect((await admin.from("student_billing_assignments").insert({
    teacher_id:teacherId,student_id:foreignStudentId,
    workplace_id:foreignWorkplaceId,billing_account_id:family.data!.id,
    effective_from:"2040-01-01",
  })).error).toBeNull();
  const invoice=await admin.from("invoices").insert({
   teacher_id:teacherId,billing_account_id:family.data!.id,status:"draft",
   period_start:"2042-01-01",period_end:"2042-01-31",
   currency:"USD",subtotal_cents:7500,
  }).select("id").single();
  expect(invoice.error).toBeNull();
  const pkg=await admin.from("credit_packages").insert({
   teacher_id:teacherId,student_id:foreignStudentId,
   workplace_id:foreignWorkplaceId,invoice_id:invoice.data!.id,
   credits:5,duration_minutes:45,price_cents:7500,
   starts_on:"2042-01-01",expires_on:"2042-12-31",
  }).select("id").single();
  expect(pkg.error).toBeNull();
  const packageId=pkg.data!.id as string;
  const listSite=await page.request.get("/api/billing/credit-packages");
  expect(listSite.status(),await listSite.text()).toBe(200);
  expect((await listSite.json()).packages.some((x:{id:string})=>x.id===packageId)).toBe(false);
  const listMcp=await call("ccp_credits_packages_list",{});
  expect(listMcp.error).toBeUndefined();
  expect(listMcp.data.packages.some((x:{id:string})=>x.id===packageId)).toBe(false);
  expect((await page.request.get("/api/billing/credit-packages?studentId="+foreignStudentId)).status()).toBe(404);
  expect((await call("ccp_credits_packages_list",{
   studentId:foreignStudentId,
  })).error?.code).toBe("NOT_FOUND");
  expect((await page.request.post("/api/billing/credit-packages",{
   data:{studentId:foreignStudentId,workplaceId:foreignWorkplaceId,
    credits:2,durationMinutes:45,
    priceCents:4000,startsOn:"2042-02-01",requestId:randomUUID()},
  })).status()).toBe(404);
  expect((await call("ccp_credits_package_create",{
   studentId:foreignStudentId,workplaceId:foreignWorkplaceId,
   credits:2,durationMinutes:45,
   priceCents:4000,startsOn:"2042-02-01",requestId:randomUUID(),confirmed:true,
  })).error?.code).toBe("NOT_FOUND");
  expect((await page.request.patch("/api/billing/credit-packages/"+packageId,{
   data:{expiresOn:"2043-01-01",expectedBalance:5,
    reason:"Tenant isolation synthetic extension rejection",requestId:randomUUID(),confirmed:true},
  })).status()).toBe(404);
  expect((await call("ccp_credits_package_expiry",{
   packageId,expiresOn:"2043-01-01",expectedBalance:5,
   reason:"Tenant isolation synthetic extension rejection",requestId:randomUUID(),confirmed:true,
  })).error?.code).toBe("NOT_FOUND");
  const {data:unchanged,error}=await admin.from("credit_packages")
   .select("expires_on").eq("id",packageId).single();
  expect(error).toBeNull();
  expect(unchanged?.expires_on).toBe("2042-12-31");
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
