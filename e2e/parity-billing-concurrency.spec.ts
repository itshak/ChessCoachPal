import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-billing-generation-concurrent-commit permits one invoice and rolls back invalid regeneration",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Concurrent billing pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const family=await call("ccp_v1_guardians_create",{
   name:"Concurrent billing household "+randomUUID(),
   studentIds:[studentId],confirmed:true,
 });
 expect(family.error).toBeUndefined();
 expect((await page.request.put("/api/students/"+studentId,{
   data:{defaultRateCents:6200},
 })).status()).toBe(200);
 const workplace=await call("ccp_v1_workplaces_create",{
   name:"Concurrent invoice workplace "+randomUUID(),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await call("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const lesson=await call("ccp_v1_sessions_create",{
   workplaceId,studentId,title:"Concurrent invoice lesson",
   startsAt:"2043-03-19T15:00:00Z",durationMinutes:60,
   lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(lesson.error).toBeUndefined();
 const sessionId=lesson.data.entityId as string;
 const attendance=await call("ccp_v1_session_attendance_set",{
   sessionId,studentId,status:"present",note:"",
   noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
   notifyFamily:false,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(attendance.error).toBeUndefined();
 const period={periodStart:"2043-03-01",periodEnd:"2043-03-31"};
 const sitePreview=await page.request.post("/api/billing/generate",{
   data:{...period,commit:false},
 });
 expect(sitePreview.status(),await sitePreview.text()).toBe(200);
 const mcpPreview=await call("ccp_v1_billing_generation_preview",period);
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data).toEqual(await sitePreview.json());
 expect(mcpPreview.data.totalCents).toBe(6200);
 // The two clients may prepare overlapping previews. The final PostgreSQL
 // teacher-period lock and duplicate line check must select exactly one.
 const [browser,model]=await Promise.all([
   page.request.post("/api/billing/generate",{data:{...period,commit:true}}),
   call("ccp_v1_billing_generation_commit",{...period,confirmed:true}),
 ]);
 const browserWon=browser.status()===200;
 const mcpWon=model.error===undefined;
 expect(Number(browserWon)+Number(mcpWon)).toBe(1);
 if(!browserWon)expect([400,409]).toContain(browser.status());
 if(!mcpWon)expect(["VALIDATION_ERROR","CONFLICT"]).toContain(model.error?.code);
 const winner=browserWon?await browser.json():model.data;
 expect(winner.count).toBe(1);
 expect(winner.created).toHaveLength(1);
 const invoiceId=winner.created[0] as string;
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
   });
 const {data:lines,error:lineError}=await admin.from("invoice_items")
   .select("invoice_id,session_id,student_id,amount_cents")
   .eq("session_id",sessionId).eq("student_id",studentId);
 expect(lineError).toBeNull();
 expect(lines).toHaveLength(1);
 expect(lines![0]).toMatchObject({
   invoice_id:invoiceId,session_id:sessionId,student_id:studentId,amount_cents:6200,
 });
 const detail=await page.request.get("/api/billing/invoices/"+invoiceId);
 expect(detail.status()).toBe(200);
 const before=await detail.json();
 expect(before.subtotal_cents).toBe(6200);

 // Simulate an invalid late row in the same regeneration transaction.
 // The SQL must roll back the earlier DELETE and valid line insertion.
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
   });
 expect((await auth.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const {error:badRegeneration}=await auth.rpc("ccp_canonical_invoice_regenerate_atomic",{
   p_invoice_id:invoiceId,
   p_items:[
    {sessionId,studentId,kind:"lesson",description:"Valid first row",
     quantity:1,unitCents:6700,amountCents:6700},
    {sessionId:randomUUID(),studentId:randomUUID(),kind:"lesson",description:"Unowned second row",
     quantity:1,unitCents:200,amountCents:200},
   ],
   p_redemptions:[],
   p_expected_updated_at:before.updated_at,
   p_request_id:randomUUID(),
 });
 expect(badRegeneration).not.toBeNull();
 const unchanged=await page.request.get("/api/billing/invoices/"+invoiceId);
 expect(unchanged.status()).toBe(200);
 const still=await unchanged.json();
 expect(still.subtotal_cents).toBe(6200);
 expect(still.invoice_items).toHaveLength(1);
 expect(still.invoice_items[0]).toMatchObject({
   session_id:sessionId,student_id:studentId,lesson_id:null,
 });
 expect(still.invoice_items[0].amount_cents).toBe(6200);
 const modelAfter=await call("ccp_v1_billing_invoice_detail",{invoiceId});
 expect(modelAfter.error).toBeUndefined();
 expect(modelAfter.data.invoice_items).toEqual(still.invoice_items);
 // A normal rate adjustment still regenerates through the website and MCP.
 expect((await page.request.put("/api/students/"+studentId,{
   data:{defaultRateCents:7100},
 })).status()).toBe(200);
 const rebuilt=await call("ccp_v1_billing_invoice_regenerate",{
   invoiceId,confirmed:true,
 });
 expect(rebuilt.error).toBeUndefined();
 expect(rebuilt.data.subtotalCents).toBe(7100);
 expect((await page.request.get("/api/billing/invoices/"+invoiceId)).status()).toBe(200);
 const final=await (await page.request.get("/api/billing/invoices/"+invoiceId)).json();
 expect(final.subtotal_cents).toBe(7100);
 expect(final.invoice_items).toHaveLength(1);
});
