import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-billing-generation-regeneration reconciles period, attendance and changed lesson rates",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Invoice-rate pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const family=await call("ccp_v1_guardians_create",{
   name:"Invoice-rate family "+randomUUID(),studentIds:[studentId],
   confirmed:true,
 });
 expect(family.error).toBeUndefined();
 const rate=await page.request.put("/api/students/"+studentId,{
   data:{defaultRateCents:6000},
 });
 expect(rate.status(),await rate.text()).toBe(200);
 const workplace=await call("ccp_v1_workplaces_create",{
  name:"Invoice-rate studio "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const enrolled=await call("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 });
 expect(enrolled.error).toBeUndefined();
 const lesson=await call("ccp_v1_sessions_create",{
   workplaceId,studentId,title:"Rate-driven individual lesson",
   startsAt:"2042-10-15T13:00:00Z",durationMinutes:60,
   lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(lesson.error).toBeUndefined();
 const sessionId=lesson.data.entityId as string;
 const attended=await call("ccp_v1_session_attendance_set",{
   sessionId,studentId,status:"present",note:"",
   noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
   notifyFamily:false,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(attended.error).toBeUndefined();
 const period={periodStart:"2042-10-01",periodEnd:"2042-10-31"};
 const browserPreview=await page.request.post("/api/billing/generate",{
   data:{...period,commit:false},
 });
 expect(browserPreview.status(),await browserPreview.text()).toBe(200);
 const preview=await browserPreview.json();
 const mcpPreview=await call("ccp_v1_billing_generation_preview",period);
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data).toEqual(preview);
 expect(preview.totalFamilies).toBe(1);
 expect(preview.totalCents).toBe(6000);
 expect(preview.drafts[0].missingRateCount).toBe(0);
 expect(preview.drafts[0].creditedLessonCount).toBe(0);
 expect(preview.drafts[0].items).toHaveLength(1);
 const committed=await call("ccp_v1_billing_generation_commit",{
   ...period,confirmed:true,
 });
 expect(committed.error).toBeUndefined();
 expect(committed.data.count).toBe(1);
 expect(committed.data.created).toHaveLength(1);
 const invoiceId=committed.data.created[0] as string;
 let browser=await page.request.get("/api/billing/invoices/"+invoiceId);
 expect(browser.status(),await browser.text()).toBe(200);
 let site=await browser.json();
 expect(site.subtotal_cents).toBe(6000);
 expect(site.invoice_items).toHaveLength(1);
 expect(site.invoice_items[0]).toMatchObject({
  session_id:sessionId,student_id:studentId,
 });
 const mcp=await call("ccp_v1_billing_invoice_detail",{invoiceId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data.subtotal_cents).toBe(site.subtotal_cents);
 expect(mcp.data.invoice_items).toEqual(site.invoice_items);
 const adjusted=await page.request.put("/api/students/"+studentId,{
   data:{defaultRateCents:7200},
 });
 expect(adjusted.status(),await adjusted.text()).toBe(200);
 const regenerated=await call("ccp_v1_billing_invoice_regenerate",{
   invoiceId,confirmed:true,
 });
 expect(regenerated.error).toBeUndefined();
 expect(regenerated.data.ok).toBe(true);
 expect(regenerated.data.subtotalCents).toBe(7200);
 browser=await page.request.get("/api/billing/invoices/"+invoiceId);
 expect(browser.status()).toBe(200);
 site=await browser.json();
 expect(site.subtotal_cents).toBe(7200);
 expect(site.invoice_items).toHaveLength(1);
 const reversed=await page.request.put("/api/students/"+studentId,{
   data:{defaultRateCents:8100},
 });
 expect(reversed.status(),await reversed.text()).toBe(200);
 const siteRegen=await page.request.post(
   "/api/billing/invoices/"+invoiceId+"/regenerate",
 );
 expect(siteRegen.status(),await siteRegen.text()).toBe(200);
 expect((await siteRegen.json()).subtotalCents).toBe(8100);
 const final=await call("ccp_v1_billing_invoice_detail",{invoiceId});
 expect(final.error).toBeUndefined();
 expect(final.data.subtotal_cents).toBe(8100);
 expect(final.data.invoice_items).toHaveLength(1);
 const doubleBill=await page.request.post("/api/billing/generate",{
   data:{...period,commit:true},
 });
 expect(doubleBill.status()).toBe(400);
 const check=await call("ccp_v1_billing_generation_preview",period);
 expect(check.error).toBeUndefined();
 expect(check.data.totalFamilies).toBe(0);
 expect(check.data.skippedAlreadyInvoiced).toBeGreaterThan(0);
});
