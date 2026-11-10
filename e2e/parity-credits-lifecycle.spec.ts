import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-credits-full-lifecycle creates, adjusts, redeems and returns credits on both surfaces",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Prepaid chess pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const family=await call("ccp_v1_guardians_create",{
   name:"Credit family "+randomUUID(),studentIds:[studentId],confirmed:true,
 });
 expect(family.error).toBeUndefined();
 const payload={
   studentId,credits:2,durationMinutes:45,priceCents:9000,
   startsOn:"2042-07-01",expiresOn:"2042-08-01",
 };
 const requestId=randomUUID();
 const made=await call("ccp_v1_credits_package_create",{
   ...payload,requestId,confirmed:true,
 });
 expect(made.error).toBeUndefined();
 expect(made.data.replayed).toBe(false);
 const packageId=made.data.packageId as string;
 const invoiceId=made.data.invoiceId as string;
 const replay=await call("ccp_v1_credits_package_create",{
   ...payload,requestId,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({packageId,invoiceId,replayed:true});
 const conflict=await call("ccp_v1_credits_package_create",{
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
 const initial=(await website.json()).packages as Array<any>;
 expect(initial.find(x=>x.id===packageId)?.invoiceStatus).toBe("draft");
 const mcpInitial=await call("ccp_v1_credits_packages_list",{studentId});
 expect(mcpInitial.error).toBeUndefined();
 expect(mcpInitial.data.packages).toEqual(initial);
 const changed=await page.request.patch("/api/billing/credit-packages/"+packageId,{
   data:{expiresOn:"2042-08-31"},
 });
 expect(changed.status(),await changed.text()).toBe(200);
 const updated=await call("ccp_v1_credits_packages_list",{studentId});
 expect(updated.error).toBeUndefined();
 expect(updated.data.packages.find((x:{id:string})=>x.id===packageId).expiresOn)
   .toBe("2042-08-31");
 const later=await call("ccp_v1_credits_package_expiry",{
   packageId,expiresOn:"2042-09-30",confirmed:true,
 });
 expect(later.error).toBeUndefined();
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
 const lesson=await call("ccp_v1_calendar_lessons_create",{
   studentId,date:"2042-07-10",time:"10:00",durationMinutes:45,confirmed:true,
 });
 expect(lesson.error).toBeUndefined();
 const lessonId=lesson.data.id as string;
 const attended=await call("ccp_v1_calendar_attendance_record",{
   lessonId,status:"attended",notifyFamily:false,confirmed:true,
 });
 expect(attended.error).toBeUndefined();
 const preview=await page.request.post("/api/billing/generate",{
   data:{periodStart:"2042-07-01",periodEnd:"2042-07-31",commit:false},
 });
 expect(preview.status(),await preview.text()).toBe(200);
 expect((await preview.json()).creditsToUse).toBe(1);
 const mcpPreview=await call("ccp_v1_billing_generation_preview",{
   periodStart:"2042-07-01",periodEnd:"2042-07-31",
 });
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data.creditsToUse).toBe(1);
 const applied=await page.request.post("/api/billing/generate",{
   data:{periodStart:"2042-07-01",periodEnd:"2042-07-31",commit:true},
 });
 expect(applied.status(),await applied.text()).toBe(200);
 expect((await applied.json()).creditsUsed).toBe(1);
 const read=await call("ccp_v1_credits_packages_list",{studentId});
 expect(read.error).toBeUndefined();
 const pkg=read.data.packages.find((x:{id:string})=>x.id===packageId);
 expect(pkg.usedCredits).toBe(1);
 expect(pkg.redemptions).toHaveLength(1);
 const siteUsed=await page.request.get("/api/billing/credit-packages?studentId="+studentId);
 expect(siteUsed.status(),await siteUsed.text()).toBe(200);
 expect(read.data.packages).toEqual((await siteUsed.json()).packages);
 const wrongExpiry=await page.request.patch("/api/billing/credit-packages/"+packageId,{
   data:{expiresOn:"2042-07-09"},
 });
 expect(wrongExpiry.status()).toBe(409);
 const mcpWrongExpiry=await call("ccp_v1_credits_package_expiry",{
   packageId,expiresOn:"2042-07-09",confirmed:true,
 });
 expect(mcpWrongExpiry.error?.code).toBe("CONFLICT");
 const returned=await call("ccp_v1_credits_redemption_return",{
   redemptionId:pkg.redemptions[0].id,confirmed:true,
 });
 expect(returned.error).toBeUndefined();
 const afterReturn=await page.request.get("/api/billing/credit-packages?studentId="+studentId);
 expect(afterReturn.status(),await afterReturn.text()).toBe(200);
 const restored=(await afterReturn.json()).packages.find((x:{id:string})=>x.id===packageId);
 expect(restored.usedCredits).toBe(0);
 expect(restored.redemptions).toHaveLength(0);
 const missing=await page.request.delete(
   "/api/billing/credit-redemptions/"+pkg.redemptions[0].id);
 expect(missing.status()).toBe(404);
});
