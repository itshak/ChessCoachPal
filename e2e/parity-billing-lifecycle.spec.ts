import {insertTestBillingAccount,prepareSendableInvoice} from "./helpers/canonical-payer";
import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {SEED_TEACHER} from "./helpers/auth";

type InvoiceApiRow = {
 id: string; status: string; subtotal_cents: number; updated_at: string;
 sent_at: string | null; stripe_checkout_session_id: string | null;
 stripe_checkout_url: string | null;
 invoice_items: { description: string; amount_cents: number }[];
 payments: { id: string; amount_cents: number }[];
};
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
 const portalToken=randomUUID();
 const guardian=await insertTestBillingAccount(admin,{teacherId:teacherId,displayName:"Billing family "+suffix,email:"billing-"+suffix+"@example.com"});
 expect(guardian.error).toBeNull();
 const made=await admin.from("invoices").insert({
   teacher_id:teacherId,billing_account_id:guardian.data!.id,status,
   period_start:"2027-03-01",period_end:"2027-03-31",
   currency:"USD",subtotal_cents:subtotal,
    ...(status==="sent"?{sent_at:new Date().toISOString()}:{}),
 }).select("id").single();
 expect(made.error).toBeNull();
 return {id:made.data!.id as string,guardianId:guardian.data!.id as string,
  contactId:guardian.data!.contactId!,teacherId,portalToken,admin};
}
/** Any household-wide pre-v1 link is invalid after the single final cutover.
 * A delivered invoice does not reinstate broad guest access. Scoped portal
 * grants are covered separately by the authorized-grant E2E suite.
 */
async function expectLegacyPortalDenied(page:import("@playwright/test").Page,
 token:string, invoiceId:string){
 const response=await page.goto("/portal/"+token);
 expect(response?.status()).toBeLessThan(500);
 const body=await page.locator("body").innerText();
 expect(body).not.toContain(invoiceId);
 expect(body).not.toContain("Billing family");
 expect(body).not.toContain("2027-03-01");
 expect(body).not.toContain("Paid chess lesson");
}

async function siteInvoice(page:import("@playwright/test").Page,id:string){
 const r=await page.request.get("/api/billing/invoices/"+id);
 expect(r.status(),await r.text()).toBe(200);
 return await r.json() as InvoiceApiRow;
}

test("PARITY:PARITY-billing-invoice-read-list mirrors owned totals and masks family credentials",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",16500);
 const website=await siteInvoice(page,seeded.id);
 expect(website.id).toBe(seeded.id);
 expect(website.subtotal_cents).toBe(16500);
 const detail=await call("ccp_billing_invoice_detail",{invoiceId:seeded.id});
 expect(detail.error).toBeUndefined();
 expect(detail.data.id).toBe(website.id);
 expect(detail.data.subtotal_cents).toBe(website.subtotal_cents);
 expect(JSON.stringify(detail.data)).not.toMatch(/token_digest|portal_token/i);
 expect(detail.data.billingAccount).toBeTruthy();
 expect(detail.data.billingAccount.contactId).toBeUndefined();
 const list=await call("ccp_billing_invoices_list",{status:"sent",limit:100,offset:0});
 expect(list.error).toBeUndefined();
 expect(list.data.invoices.some((x:{id:string;subtotal_cents:number})=>
   x.id===seeded.id&&x.subtotal_cents===16500)).toBe(true);
});

test("PARITY:PARITY-billing-manual-payment record reverse and replay match website ledger",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",12000);
 const idempotencyKey=randomUUID();
 const first=await call("ccp_billing_manual_payment_record",{
   invoiceId:seeded.id,amountCents:3000,note:"Cash collected",
   idempotencyKey,confirmed:true,
 });
 expect(first.error).toBeUndefined();
 expect(first.data.amountCents).toBe(3000);
 const replay=await call("ccp_billing_manual_payment_record",{
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
 const detail=await call("ccp_billing_invoice_detail",{invoiceId:seeded.id});
 expect(detail.error).toBeUndefined();
 expect(detail.data.payments.some((x:{amount_cents:number})=>x.amount_cents===2500))
   .toBe(true);
 const reversed=await call("ccp_billing_manual_payment_delete",{
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
 const voided=await call("ccp_billing_invoice_void",{
   invoiceId:draft.id,confirmed:true,
 });
 expect(voided.error).toBeUndefined();
 const website=await siteInvoice(page,draft.id);
 expect(website.status).toBe("void");
 const websiteDelete=await page.request.delete("/api/billing/invoices/"+draft.id);
 expect(websiteDelete.status(),await websiteDelete.text()).toBe(200);
 const gone=await call("ccp_billing_invoice_detail",{invoiceId:draft.id});
 expect(gone.error?.code).toBe("NOT_FOUND");
 const another=await invoice("draft",8300);
 const deleted=await call("ccp_billing_invoice_delete",{
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
 const mcp=await call("ccp_billing_manual_payment_record",{
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
   call("ccp_billing_manual_payment_record",{
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
 const paid=await call("ccp_billing_invoice_detail",{invoiceId:seeded.id});
 expect(paid.error).toBeUndefined();
 expect(paid.data.status).toBe("paid");
 expect(paid.data.payments.reduce((sum:number,p:{amount_cents:number})=>
   sum+p.amount_cents,0)).toBe(10000);

 const delayedRetry=await call("ccp_billing_manual_payment_record",{
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


test("PARITY:PARITY-billing-atomic-payment-correction reopens settled invoice from MCP and website",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",5000);
 const paid=await call("ccp_billing_manual_payment_record",{
   invoiceId:seeded.id,amountCents:5000,note:"Mistaken paid entry",
   idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(paid.error).toBeUndefined();
 expect(paid.data.paid).toBe(true);
 expect((await siteInvoice(page,seeded.id)).status).toBe("paid");
 const corrected=await page.request.delete(
   "/api/billing/invoices/"+seeded.id+"/payments/"+paid.data.paymentId,
 );
 expect(corrected.status(),await corrected.text()).toBe(200);
 expect((await corrected.json()).status).toBe("sent");
 expect((await siteInvoice(page,seeded.id)).payments).toHaveLength(0);
 const second=await page.request.post("/api/billing/invoices/"+seeded.id+"/mark-paid",{
   data:{amountCents:5000,note:"Correct actual payment",idempotencyKey:randomUUID()},
 });
 expect(second.status(),await second.text()).toBe(200);
 const secondPayment=(await second.json()).paymentId as string;
 const removed=await call("ccp_billing_manual_payment_delete",{
   invoiceId:seeded.id,paymentId:secondPayment,confirmed:true,
 });
 expect(removed.error).toBeUndefined();
 expect(removed.data.status).toBe("sent");
 const final=await siteInvoice(page,seeded.id);
 expect(final.status).toBe("sent");
 expect(final.payments).toHaveLength(0);
});


test("PARITY:PARITY-billing-shared-payment-validation rejects unknown fields in website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",5000);
 const payload={amountCents:2000,note:"Valid cash",idempotencyKey:randomUUID()};
 const invalidWeb=await page.request.post(
  "/api/billing/invoices/"+seeded.id+"/mark-paid",{
    data:{...payload,stripeToken:"must never accept"},
  });
 expect(invalidWeb.status(),await invalidWeb.text()).toBe(400);
 const invalidModel=await call("ccp_billing_manual_payment_record",{
   invoiceId:seeded.id,...payload,stripeToken:"must never accept",confirmed:true,
 });
 expect(invalidModel.error?.code).toBe("VALIDATION_ERROR");
 const detail=await siteInvoice(page,seeded.id);
 expect(detail.payments).toHaveLength(0);
 const valid=await page.request.post(
  "/api/billing/invoices/"+seeded.id+"/mark-paid",{data:payload});
 expect(valid.status(),await valid.text()).toBe(200);
 const replay=await call("ccp_billing_manual_payment_record",{
   invoiceId:seeded.id,...payload,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data.paymentId).toBe((await valid.json()).paymentId);
});

test("PARITY:PARITY-billing-manual-payment-foreign-tenant-denial blocks website and MCP record and reversal",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const email="foreign-payment-"+randomUUID()+"@example.com";
 const password="SyntheticPaymentTenant-123!";
 const identity=await admin.auth.admin.createUser({
  email,password,email_confirm:true,
 });
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Unrelated finance teacher",
   hosted_enforced:false,
  })).error).toBeNull();
  const guardian=await insertTestBillingAccount(admin,{teacherId:teacherId,displayName:"Other studio family"});
  expect(guardian.error).toBeNull();
  const invoice=await admin.from("invoices").insert({
   teacher_id:teacherId,billing_account_id:guardian.data!.id,
   status:"sent",subtotal_cents:5600,currency:"USD",
   period_start:"2040-01-01",period_end:"2040-01-31",
  }).select("id").single();
  expect(invoice.error).toBeNull();
  const invoiceId=invoice.data!.id as string;
  const paid=await admin.from("payments").insert({
   invoice_id:invoiceId,amount_cents:900,method:"manual",
   note:"Other studio payment",
  }).select("id").single();
  expect(paid.error).toBeNull();
  const paymentId=paid.data!.id as string;
  const webRecord=await page.request.post("/api/billing/invoices/"+invoiceId+"/mark-paid",{
   data:{amountCents:500,idempotencyKey:randomUUID()},
  });
  expect(webRecord.status()).toBe(404);
  const modelRecord=await call("ccp_billing_manual_payment_record",{
   invoiceId,amountCents:500,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(modelRecord.error?.code).toBe("NOT_FOUND");
  const webDelete=await page.request.delete(
   "/api/billing/invoices/"+invoiceId+"/payments/"+paymentId);
  expect(webDelete.status()).toBe(404);
  const modelDelete=await call("ccp_billing_manual_payment_delete",{
   invoiceId,paymentId,confirmed:true,
  });
  expect(modelDelete.error?.code).toBe("NOT_FOUND");
  const unaffected=await admin.from("payments").select("id,amount_cents")
   .eq("id",paymentId).single();
  expect(unaffected.error).toBeNull();
  expect(unaffected.data?.amount_cents).toBe(900);
 }finally{
  await admin.auth.admin.deleteUser(teacherId);
 }
});

test("PARITY:PARITY-billing-manual-payment-reverse-race leaves one ordered ledger correction across website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",7700);
 const record=await call("ccp_billing_manual_payment_record",{
  invoiceId:seeded.id,amountCents:7700,note:"Duplicate coaching receipt",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(record.error).toBeUndefined();
 const paymentId=record.data.paymentId as string;
 const [website,mcp]=await Promise.all([
  page.request.delete("/api/billing/invoices/"+seeded.id+"/payments/"+paymentId),
  call("ccp_billing_manual_payment_delete",{
   invoiceId:seeded.id,paymentId,confirmed:true,
  }),
 ]);
 const websiteWon=website.status()===200;
 const mcpWon=mcp.error===undefined;
 expect(Number(websiteWon)+Number(mcpWon)).toBe(1);
 if(!websiteWon)expect(website.status()).toBe(404);
 if(!mcpWon)expect(mcp.error?.code).toBe("NOT_FOUND");
 const final=await siteInvoice(page,seeded.id);
 expect(final.status).toBe("sent");
 expect(final.payments.some((p:{id:string})=>p.id===paymentId)).toBe(false);
 const after=await call("ccp_billing_invoice_detail",{invoiceId:seeded.id});
 expect(after.error).toBeUndefined();
 expect(after.data.status).toBe("sent");
 expect(after.data.payments).toHaveLength(0);
});

test("PARITY:PARITY-billing-invoice-void-atomic-replay serializes browser and MCP and rejects changed-key reuse",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",8000);
 const key=randomUUID();
 const [website,model]=await Promise.all([
  page.request.post("/api/billing/invoices/"+seeded.id+"/void",{
   data:{idempotencyKey:key},
  }),
  call("ccp_billing_invoice_void",{
   invoiceId:seeded.id,idempotencyKey:key,confirmed:true,
  }),
 ]);
 expect(website.status(),await website.text()).toBe(200);
 expect(model.error).toBeUndefined();
 const browserReceipt=await website.json() as {ok:boolean;replayed:boolean;
  invoiceId:string;idempotencyKey:string};
 expect(browserReceipt).toMatchObject({ok:true,invoiceId:seeded.id,idempotencyKey:key});
 expect(model.data).toMatchObject({ok:true,invoiceId:seeded.id,idempotencyKey:key});
 expect(Number(browserReceipt.replayed)+Number(model.data.replayed)).toBe(1);
 expect((await siteInvoice(page,seeded.id)).status).toBe("void");
 const other=await invoice("draft",4500);
 const reused=await call("ccp_billing_invoice_void",{
  invoiceId:other.id,idempotencyKey:key,confirmed:true,
 });
 expect(reused.error?.code).toBe("IDEMPOTENCY_CONFLICT");
 expect((await siteInvoice(page,other.id)).status).toBe("draft");
 const invalidWeb=await page.request.post(
  "/api/billing/invoices/"+other.id+"/void",{data:{
   idempotencyKey:randomUUID(),forcePaid:true,
  }});
 expect(invalidWeb.status(),await invalidWeb.text()).toBe(400);
 const invalidModel=await call("ccp_billing_invoice_void",{
  invoiceId:other.id,idempotencyKey:randomUUID(),forcePaid:true,confirmed:true,
 });
 expect(invalidModel.error?.code).toBe("VALIDATION_ERROR");
});

test("PARITY:PARITY-billing-invoice-void-financial-guards refuse paid value and unresolved checkout",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const cash=await invoice("sent",9000);
 const payment=await cash.admin.from("payments").insert({
  invoice_id:cash.id,amount_cents:1900,method:"manual",
  note:"Actual customer funds require reconciliation",
 });
 expect(payment.error).toBeNull();
 const denyWebsite=await page.request.post(
  "/api/billing/invoices/"+cash.id+"/void",{data:{
   idempotencyKey:randomUUID(),
  }});
 expect(denyWebsite.status(),await denyWebsite.text()).toBe(409);
 const denyMcp=await call("ccp_billing_invoice_void",{
  invoiceId:cash.id,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(denyMcp.error?.code).toBe("CONFLICT");
 expect((await siteInvoice(page,cash.id)).status).toBe("sent");
 const checkout=await invoice("sent",6500);
 const update=await checkout.admin.from("invoices").update({
  stripe_checkout_session_id:"cs_test_"+randomUUID().replaceAll("-",""),
 }).eq("id",checkout.id);
 expect(update.error).toBeNull();
 const denyCheckout=await call("ccp_billing_invoice_void",{
  invoiceId:checkout.id,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(denyCheckout.error?.code).toBe("CONFLICT");
 expect((await siteInvoice(page,checkout.id)).status).toBe("sent");
});

test("PARITY:PARITY-billing-invoice-void-credit-guard refuses to orphan issued prepaid lessons",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("draft",12000);
 const row=await seeded.admin.from("invoices").select("teacher_id")
  .eq("id",seeded.id).single();
 expect(row.error).toBeNull();
 const student=await seeded.admin.from("students").insert({
  teacher_id:row.data!.teacher_id,name:"Prepaid student "+randomUUID(),
 }).select("id").single();
 expect(student.error).toBeNull();
 const workplace=await seeded.admin.from("workplaces").insert({
  teacher_id:row.data!.teacher_id,name:"Prepaid workplace "+randomUUID(),
  timezone:"UTC",currency:"ILS",locale:"en",policy:{},
 }).select("id").single();
 expect(workplace.error).toBeNull();
 const enrollment=await seeded.admin.from("workplace_enrollments").insert({
  teacher_id:row.data!.teacher_id,student_id:student.data!.id,
  workplace_id:workplace.data!.id,
 });
 expect(enrollment.error).toBeNull();
 const packageRow=await seeded.admin.from("credit_packages").insert({
  teacher_id:row.data!.teacher_id,student_id:student.data!.id,
  workplace_id:workplace.data!.id,
  invoice_id:seeded.id,credits:5,duration_minutes:45,
  price_cents:12000,starts_on:"2049-01-01",
 }).select("id").single();
 expect(packageRow.error).toBeNull();
 const website=await page.request.post("/api/billing/invoices/"+seeded.id+"/void",{
  data:{idempotencyKey:randomUUID()},
 });
 expect(website.status(),await website.text()).toBe(409);
 const mcp=await call("ccp_billing_invoice_void",{
  invoiceId:seeded.id,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(mcp.error?.code).toBe("CREDITS_EXIST");
 expect((await siteInvoice(page,seeded.id)).status).toBe("draft");
 const remains=await seeded.admin.from("credit_packages").select("id")
  .eq("id",packageRow.data!.id).single();
 expect(remains.error).toBeNull();
});


test("PARITY:PARITY-billing-regenerate-checkout-reconciliation blocks stale payment links for browser, MCP and SQL",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("draft",5500);
 const {error:lineError}=await seeded.admin.from("invoice_items").insert({
   invoice_id:seeded.id,session_id:null,student_id:null,kind:"lesson",
   description:"Original chess lesson invoice",quantity:1,unit_cents:5500,
   amount_cents:5500,sort_order:0,
 });
 expect(lineError).toBeNull();
 const checkoutId="cs_test_"+randomUUID().replaceAll("-","");
 const checkoutUrl="https://checkout.stripe.com/c/pay/"+checkoutId;
 const {error:linkError}=await seeded.admin.from("invoices").update({
   stripe_checkout_session_id:checkoutId,stripe_checkout_url:checkoutUrl,
 }).eq("id",seeded.id);
 expect(linkError).toBeNull();
 const before=await siteInvoice(page,seeded.id);
 expect(before.status).toBe("draft");
 expect(before.invoice_items).toHaveLength(1);
 expect(before.subtotal_cents).toBe(5500);

 const browser=await page.request.post(
   "/api/billing/invoices/"+seeded.id+"/regenerate"
 );
 expect(browser.status(),await browser.text()).toBe(409);
 expect((await browser.json()).error).toContain("Reconcile");
 const model=await call("ccp_billing_invoice_regenerate",{
   invoiceId:seeded.id,confirmed:true,
 });
 expect(model.error?.code).toBe("CONFLICT");

 // Even a direct authenticated RPC may not bypass the shared guard, since
 // the transaction locks the invoice before deleting any existing line.
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
     auth:{persistSession:false,autoRefreshToken:false},
   });
 const signedIn=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(signedIn.error).toBeNull();
 const direct=await auth.rpc("ccp_canonical_invoice_regenerate_atomic",{
   p_invoice_id:seeded.id,p_items:[],p_redemptions:[],
   p_expected_updated_at:before.updated_at,p_request_id:randomUUID(),
 });
 expect(direct.error?.message).toContain("INVOICE_REGENERATION_BLOCKED");

 const after=await siteInvoice(page,seeded.id);
 expect(after.status).toBe("draft");
 expect(after.subtotal_cents).toBe(before.subtotal_cents);
 expect(after.stripe_checkout_session_id).toBe(checkoutId);
 expect(after.stripe_checkout_url).toBe(checkoutUrl);
 expect(after.invoice_items.map((x:{description:string;amount_cents:number})=>({
   description:x.description,amount_cents:x.amount_cents,
 }))).toEqual(before.invoice_items.map((x:{description:string;amount_cents:number})=>({
   description:x.description,amount_cents:x.amount_cents,
 })));
});

test("PARITY:PARITY-billing-draft-partial-payment stays private and reopens to draft",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const created=await invoice("draft",9000);
 const item=await created.admin.from("invoice_items").insert({
  invoice_id:created.id,kind:"lesson",description:"Chess coaching",
  quantity:1,unit_cents:9000,amount_cents:9000,sort_order:0,
 });
 expect(item.error).toBeNull();
 const key=randomUUID();
 const data={amountCents:3200,note:"Paid before delivery",idempotencyKey:key};
 const url="/api/billing/invoices/"+created.id;
 const [browser,model]=await Promise.all([
  page.request.post(url+"/mark-paid",{data}),
  call("ccp_billing_manual_payment_record",{invoiceId:created.id,...data,confirmed:true}),
 ]);
 expect(browser.status(),await browser.text()).toBe(200);
 expect(model.error).toBeUndefined();
 const result=await browser.json();
 expect(result.paymentId).toBe(model.data.paymentId);
 expect(Number(Boolean(result.replayed))+Number(Boolean(model.data.replayed))).toBe(1);
 expect((await siteInvoice(page,created.id)).status).toBe("draft");
 await expectLegacyPortalDenied(page,created.portalToken,created.id);
 const before=await siteInvoice(page,created.id);
 const refused=await page.request.put(url,{data:{
  items:[{description:"Adjusted",quantity:1,unitCents:1000,amountCents:1000}],
  expectedUpdatedAt:before.updated_at,idempotencyKey:randomUUID(),
 }});
 expect(refused.status(),await refused.text()).toBe(409);
 expect((await siteInvoice(page,created.id)).subtotal_cents).toBe(9000);
 const deletion=await page.request.delete(url);
 expect(deletion.status(),await deletion.text()).toBe(409);
 const mcpDelete=await call("ccp_billing_invoice_delete",{
  invoiceId:created.id,confirmed:true,
 });
 expect(mcpDelete.error?.code).toBe("CONFLICT");
 const pdf=await page.request.get(url+"/pdf");
 expect(pdf.status(),await pdf.text()).toBe(200);
 const final=await call("ccp_billing_manual_payment_record",{
  invoiceId:created.id,amountCents:5800,note:"Remaining cash",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(final.error).toBeUndefined();
 expect((await siteInvoice(page,created.id)).status).toBe("paid");
 await expectLegacyPortalDenied(page,created.portalToken,created.id);
 const reversal=await page.request.delete(url+"/payments/"+final.data.paymentId);
 expect(reversal.status(),await reversal.text()).toBe(200);
 expect((await reversal.json()).status).toBe("draft");
 const last=await siteInvoice(page,created.id);
 expect(last.status).toBe("draft");
 expect(last.payments).toHaveLength(1);
});

test("PARITY:PARITY-billing-regenerate-draft-with-payments protects the received balance",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const created=await invoice("draft",6500);
 const line=await created.admin.from("invoice_items").insert({
  invoice_id:created.id,kind:"lesson",description:"Original chess lesson",
  quantity:1,unit_cents:6500,amount_cents:6500,sort_order:0,
 });
 expect(line.error).toBeNull();
 const payment=await page.request.post("/api/billing/invoices/"+created.id+"/mark-paid",{
  data:{amountCents:2000,note:"Partial deposit",idempotencyKey:randomUUID()},
 });
 expect(payment.status(),await payment.text()).toBe(200);
 const before=await siteInvoice(page,created.id);
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await auth.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const refused=await auth.rpc("ccp_canonical_invoice_regenerate_atomic",{
  p_invoice_id:created.id,p_items:[],p_redemptions:[],
  p_expected_updated_at:before.updated_at,p_request_id:randomUUID(),
 });
 expect(refused.error?.message).toContain("INVOICE_TOTAL_BELOW_PAID");
 const after=await siteInvoice(page,created.id);
 expect(after.status).toBe("draft");
 expect(after.subtotal_cents).toBe(6500);
 expect(after.invoice_items).toHaveLength(1);
 const mcp=await call("ccp_billing_invoice_detail",{invoiceId:created.id});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data.status).toBe("draft");
 expect(mcp.data.subtotal_cents).toBe(6500);
});

test("PARITY:PARITY-billing-send-claim rejects stale payment snapshots before email",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const created=await invoice("draft",7000);
 const item=await created.admin.from("invoice_items").insert({
  invoice_id:created.id,kind:"lesson",description:"Scheduled chess tuition",
  quantity:1,unit_cents:7000,amount_cents:7000,sort_order:0,
 });
 expect(item.error).toBeNull();
 const before=await siteInvoice(page,created.id);
 const deposit=await call("ccp_billing_manual_payment_record",{
  invoiceId:created.id,amountCents:1800,note:"Already collected",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(deposit.error).toBeUndefined();
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await auth.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const stale=await auth.rpc("ccp_invoice_send_claim",{
  p_invoice_id:created.id,p_expected_updated_at:before.updated_at,
  p_expected_paid_cents:0,
 });
 expect(stale.error?.message).toContain("INVOICE_SEND_BALANCE_CHANGED");
 const current=await siteInvoice(page,created.id);
 expect(current.status).toBe("draft");
 expect(current.sent_at).toBeNull();
 expect(current.payments).toHaveLength(1);
 await expectLegacyPortalDenied(page,created.portalToken,created.id);
 const preview=await call("ccp_billing_invoice_send_preview",{invoiceId:created.id});
 expect(preview.error).toBeUndefined();
 expect(preview.data.balanceCents).toBe(5200);
});

test("PARITY:PARITY-billing-paid-before-send remains private until deliberate delivery",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const created=await invoice("draft",5400);
 const item=await created.admin.from("invoice_items").insert({
  invoice_id:created.id,kind:"lesson",description:"Paid chess lesson",
  quantity:1,unit_cents:5400,amount_cents:5400,sort_order:0,
 });
 expect(item.error).toBeNull();
 // Sending a paid-but-never-delivered invoice still requires a real lesson
 // attribution, the dated payer and explicit student/contact message consent.
 await prepareSendableInvoice(created.admin,{
   teacherId:created.teacherId,invoiceId:created.id,
   billingAccountId:created.guardianId,contactId:created.contactId,
   periodStart:"2027-03-01",
 });
 const url="/api/billing/invoices/"+created.id;
 const payment=await page.request.post(url+"/mark-paid",{
  data:{amountCents:5400,note:"Cash received before email",
    idempotencyKey:randomUUID()},
 });
 expect(payment.status(),await payment.text()).toBe(200);
 const before=await siteInvoice(page,created.id);
 expect(before.status).toBe("paid");
 expect(before.sent_at).toBeNull();
 await expectLegacyPortalDenied(page,created.portalToken,created.id);
 const preview=await call("ccp_billing_invoice_send_preview",{
  invoiceId:created.id,confirmed:true,
 });
 expect(preview.error).toBeUndefined();
 expect(preview.data.paidCents).toBe(5400);
 expect(preview.data.balanceCents).toBe(0);
 const sent=await page.request.post(url+"/send");
 expect(sent.status(),await sent.text()).toBe(200);
 const delivered=await siteInvoice(page,created.id);
 expect(delivered.status).toBe("paid");
 expect(delivered.sent_at).not.toBeNull();
 // Delivery to a named approved contact must not grant any old household
 // token access; only a separately issued explicit scoped grant may do so.
 await expectLegacyPortalDenied(page,created.portalToken,created.id);
 const duplicate=await call("ccp_billing_invoice_send",{
  invoiceId:created.id,confirmed:true,confirmedEmail:true,
 });
 expect(duplicate.error?.code).toBe("CONFLICT");
});
