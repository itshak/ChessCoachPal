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


test("PARITY:PARITY-billing-atomic-payment-correction reopens settled invoice from MCP and website",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const seeded=await invoice("sent",5000);
 const paid=await call("ccp_v1_billing_manual_payment_record",{
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
 const removed=await call("ccp_v1_billing_manual_payment_delete",{
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
 const invalidModel=await call("ccp_v1_billing_manual_payment_record",{
   invoiceId:seeded.id,...payload,stripeToken:"must never accept",confirmed:true,
 });
 expect(invalidModel.error?.code).toBe("VALIDATION_ERROR");
 const detail=await siteInvoice(page,seeded.id);
 expect(detail.payments).toHaveLength(0);
 const valid=await page.request.post(
  "/api/billing/invoices/"+seeded.id+"/mark-paid",{data:payload});
 expect(valid.status(),await valid.text()).toBe(200);
 const replay=await call("ccp_v1_billing_manual_payment_record",{
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
  const guardian=await admin.from("guardians").insert({
   teacher_id:teacherId,name:"Other studio family",
   portal_token:randomUUID(),
  }).select("id").single();
  expect(guardian.error).toBeNull();
  const invoice=await admin.from("invoices").insert({
   teacher_id:teacherId,guardian_id:guardian.data!.id,
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
  const modelRecord=await call("ccp_v1_billing_manual_payment_record",{
   invoiceId,amountCents:500,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(modelRecord.error?.code).toBe("NOT_FOUND");
  const webDelete=await page.request.delete(
   "/api/billing/invoices/"+invoiceId+"/payments/"+paymentId);
  expect(webDelete.status()).toBe(404);
  const modelDelete=await call("ccp_v1_billing_manual_payment_delete",{
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
 const record=await call("ccp_v1_billing_manual_payment_record",{
  invoiceId:seeded.id,amountCents:7700,note:"Duplicate coaching receipt",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(record.error).toBeUndefined();
 const paymentId=record.data.paymentId as string;
 const [website,mcp]=await Promise.all([
  page.request.delete("/api/billing/invoices/"+seeded.id+"/payments/"+paymentId),
  call("ccp_v1_billing_manual_payment_delete",{
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
 const after=await call("ccp_v1_billing_invoice_detail",{invoiceId:seeded.id});
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
  call("ccp_v1_billing_invoice_void",{
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
 const reused=await call("ccp_v1_billing_invoice_void",{
  invoiceId:other.id,idempotencyKey:key,confirmed:true,
 });
 expect(reused.error?.code).toBe("IDEMPOTENCY_CONFLICT");
 expect((await siteInvoice(page,other.id)).status).toBe("draft");
 const invalidWeb=await page.request.post(
  "/api/billing/invoices/"+other.id+"/void",{data:{
   idempotencyKey:randomUUID(),forcePaid:true,
  }});
 expect(invalidWeb.status(),await invalidWeb.text()).toBe(400);
 const invalidModel=await call("ccp_v1_billing_invoice_void",{
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
 const denyMcp=await call("ccp_v1_billing_invoice_void",{
  invoiceId:cash.id,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(denyMcp.error?.code).toBe("CONFLICT");
 expect((await siteInvoice(page,cash.id)).status).toBe("sent");
 const checkout=await invoice("sent",6500);
 const update=await checkout.admin.from("invoices").update({
  stripe_checkout_session_id:"cs_test_"+randomUUID().replaceAll("-",""),
 }).eq("id",checkout.id);
 expect(update.error).toBeNull();
 const denyCheckout=await call("ccp_v1_billing_invoice_void",{
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
 const packageRow=await seeded.admin.from("credit_packages").insert({
  teacher_id:row.data!.teacher_id,student_id:student.data!.id,
  invoice_id:seeded.id,credits:5,duration_minutes:45,
  price_cents:12000,starts_on:"2049-01-01",
 }).select("id").single();
 expect(packageRow.error).toBeNull();
 const website=await page.request.post("/api/billing/invoices/"+seeded.id+"/void",{
  data:{idempotencyKey:randomUUID()},
 });
 expect(website.status(),await website.text()).toBe(409);
 const mcp=await call("ccp_v1_billing_invoice_void",{
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
   invoice_id:seeded.id,lesson_id:null,kind:"lesson",
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
 const model=await call("ccp_v1_billing_invoice_regenerate",{
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
 const direct=await auth.rpc("ccp_invoice_regenerate_atomic",{
   p_invoice_id:seeded.id,p_items:[],p_redemptions:[],
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
