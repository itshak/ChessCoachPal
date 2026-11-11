import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {SEED_TEACHER} from "./helpers/auth";

type Tool=(name:string,args:Record<string,unknown>)=>Promise<{
 data?:any;error?:{code:string;message:string};
}>;
async function invoice(status:"sent"|"draft",subtotal=12500){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const login=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(login.error).toBeNull();
 const teacherId=login.data.user!.id;
 const suffix=randomUUID().slice(0,9);
 const guardian=await admin.from("guardians").insert({
   teacher_id:teacherId,name:"Billing family "+suffix,
   email:"billing-"+suffix+"@example.com",portal_token:randomUUID(),
 }).select("id").single();
 expect(guardian.error).toBeNull();
 const made=await admin.from("invoices").insert({
   teacher_id:teacherId,guardian_id:guardian.data!.id,status,
   period_start:"2027-03-01",period_end:"2027-03-31",
   currency:"USD",subtotal_cents:subtotal,
 }).select("id").single();
 expect(made.error).toBeNull();
 return {id:made.data!.id as string,guardianId:guardian.data!.id as string,admin};
}
async function siteInvoice(page:import("@playwright/test").Page,id:string){
 const r=await page.request.get("/api/billing/invoices/"+id);
 expect(r.status(),await r.text()).toBe(200);
 return await r.json() as Record<string,any>;
}

test("PARITY:PARITY-billing-invoice-read-list mirrors owned totals and masks family credentials",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",16500);
 const website=await siteInvoice(page,seeded.id);
 expect(website.id).toBe(seeded.id);
 expect(website.subtotal_cents).toBe(16500);
 const detail=await call("ccp_v1_billing_invoice_detail",{invoiceId:seeded.id});
 expect(detail.error).toBeUndefined();
 expect(detail.data.id).toBe(website.id);
 expect(detail.data.subtotal_cents).toBe(website.subtotal_cents);
 expect(detail.data.guardians.portal_token).toBeUndefined();
 expect(detail.data.guardians.email).toBeUndefined();
 const list=await call("ccp_v1_billing_invoices_list",{status:"sent",limit:100,offset:0});
 expect(list.error).toBeUndefined();
 expect(list.data.invoices.some((x:{id:string;subtotal_cents:number})=>
   x.id===seeded.id&&x.subtotal_cents===16500)).toBe(true);
});

test("PARITY:PARITY-billing-manual-payment record reverse and replay match website ledger",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",12000);
 const idempotencyKey=randomUUID();
 const first=await call("ccp_v1_billing_manual_payment_record",{
   invoiceId:seeded.id,amountCents:3000,note:"Cash collected",
   idempotencyKey,confirmed:true,
 });
 expect(first.error).toBeUndefined();
 expect(first.data.amountCents).toBe(3000);
 const replay=await call("ccp_v1_billing_manual_payment_record",{
   invoiceId:seeded.id,amountCents:3000,note:"Cash collected",
   idempotencyKey,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data.replayed).toBe(true);
 let browser=await siteInvoice(page,seeded.id);
 expect(browser.payments.some((x:{id:string;amount_cents:number})=>
   x.id===first.data.paymentId&&x.amount_cents===3000)).toBe(true);
 const viaBrowser=await page.request.post("/api/billing/invoices/"+seeded.id+"/mark-paid",{
   data:{amountCents:2500,note:"Second check"},
 });
 expect(viaBrowser.status(),await viaBrowser.text()).toBe(200);
 const detail=await call("ccp_v1_billing_invoice_detail",{invoiceId:seeded.id});
 expect(detail.error).toBeUndefined();
 expect(detail.data.payments.some((x:{amount_cents:number})=>x.amount_cents===2500))
   .toBe(true);
 const reversed=await call("ccp_v1_billing_manual_payment_delete",{
   invoiceId:seeded.id,paymentId:first.data.paymentId,confirmed:true,
 });
 expect(reversed.error).toBeUndefined();
 browser=await siteInvoice(page,seeded.id);
 expect(browser.payments.some((x:{id:string})=>x.id===first.data.paymentId)).toBe(false);
 expect(browser.payments.some((x:{amount_cents:number})=>x.amount_cents===2500))
   .toBe(true);
});

test("PARITY:PARITY-billing-void-delete refuses silent paid erasure and preserves invoice status",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const draft=await invoice("draft",7500);
 const initial=await siteInvoice(page,draft.id);
 expect(initial.status).toBe("draft");
 const voided=await call("ccp_v1_billing_invoice_void",{
   invoiceId:draft.id,confirmed:true,
 });
 expect(voided.error).toBeUndefined();
 const website=await siteInvoice(page,draft.id);
 expect(website.status).toBe("void");
 const websiteDelete=await page.request.delete("/api/billing/invoices/"+draft.id);
 expect(websiteDelete.status(),await websiteDelete.text()).toBe(200);
 const gone=await call("ccp_v1_billing_invoice_detail",{invoiceId:draft.id});
 expect(gone.error?.code).toBe("NOT_FOUND");
 const another=await invoice("draft",8300);
 const deleted=await call("ccp_v1_billing_invoice_delete",{
   invoiceId:another.id,confirmed:true,
 });
 expect(deleted.error).toBeUndefined();
 const missing=await page.request.get("/api/billing/invoices/"+another.id);
 expect(missing.status()).toBe(404);
});

test("PARITY:PARITY-billing-manual-payment-open-checkout-fails-closed in browser and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const policy=await page.request.get("/api/settings/policy");
 expect(policy.status()).toBe(200);
 const currentPolicy=await policy.json();
 test.skip(currentPolicy.payment_provider==="stripe",
   "Synthetic fail-closed test requires the local manual studio without real Stripe credentials");
 const seeded=await invoice("sent",6000);
 const sessionId="cs_test_"+randomUUID().replaceAll("-","");
 const saved=await seeded.admin.from("invoices").update({
   stripe_checkout_session_id:sessionId,
   stripe_checkout_url:"https://checkout.stripe.com/c/pay/"+sessionId,
 }).eq("id",seeded.id);
 expect(saved.error).toBeNull();
 const web=await page.request.post("/api/billing/invoices/"+seeded.id+"/mark-paid",{
   data:{amountCents:2000,note:"Never record while Stripe link cannot be retired"},
 });
 expect(web.status(),await web.text()).toBe(409);
 expect((await web.json()).error).toContain("Reconnect Stripe");
 const mcp=await call("ccp_v1_billing_manual_payment_record",{
   invoiceId:seeded.id,amountCents:2000,note:"Never record while Stripe link cannot be retired",
   idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(mcp.error?.code).toBe("CHECKOUT_RECONCILIATION_REQUIRED");
 const details=await siteInvoice(page,seeded.id);
 expect(details.status).toBe("sent");
 expect(details.payments).toHaveLength(0);
 const {data:unchanged,error}=await seeded.admin.from("invoices")
   .select("stripe_checkout_session_id").eq("id",seeded.id).single();
 expect(error).toBeNull();
 expect(unchanged?.stripe_checkout_session_id).toBe(sessionId);
});


test("PARITY:PARITY-billing-atomic-manual-payment-settlement serializes browser and MCP retries",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",10000);
 const key=randomUUID();
 const url="/api/billing/invoices/"+seeded.id+"/mark-paid";
 const payload={amountCents:3000,note:"Cash exactly once",idempotencyKey:key};
 const [browser,agent]=await Promise.all([
   page.request.post(url,{data:payload}),
   call("ccp_v1_billing_manual_payment_record",{
     invoiceId:seeded.id,...payload,confirmed:true,
   }),
 ]);
 expect(browser.status(),await browser.text()).toBe(200);
 expect(agent.error).toBeUndefined();
 const browserResult=await browser.json();
 expect(browserResult.paymentId).toBe(agent.data.paymentId);
 expect([browserResult.replayed,agent.data.replayed].filter(Boolean)).toHaveLength(1);
 const after=await siteInvoice(page,seeded.id);
 expect(after.status).toBe("sent");
 expect(after.payments.filter((p:{id:string})=>p.id===browserResult.paymentId)).toHaveLength(1);
 expect(after.payments.reduce((sum:number,p:{amount_cents:number})=>
   sum+p.amount_cents,0)).toBe(3000);

 const settled=await page.request.post(url,{data:{
   amountCents:7000,note:"Remaining cash balance",idempotencyKey:randomUUID(),
 }});
 expect(settled.status(),await settled.text()).toBe(200);
 expect((await settled.json()).paid).toBe(true);
 const paid=await call("ccp_v1_billing_invoice_detail",{invoiceId:seeded.id});
 expect(paid.error).toBeUndefined();
 expect(paid.data.status).toBe("paid");
 expect(paid.data.payments.reduce((sum:number,p:{amount_cents:number})=>
   sum+p.amount_cents,0)).toBe(10000);

 const delayedRetry=await call("ccp_v1_billing_manual_payment_record",{
   invoiceId:seeded.id,...payload,confirmed:true,
 });
 expect(delayedRetry.error).toBeUndefined();
 expect(delayedRetry.data.replayed).toBe(true);
 expect(delayedRetry.data.paymentId).toBe(browserResult.paymentId);
 const conflict=await page.request.post(url,{data:{
   amountCents:3001,note:"Cash exactly once",idempotencyKey:key,
 }});
 expect(conflict.status(),await conflict.text()).toBe(409);
 const last=await siteInvoice(page,seeded.id);
 expect(last.payments).toHaveLength(2);
 expect(last.status).toBe("paid");
});
