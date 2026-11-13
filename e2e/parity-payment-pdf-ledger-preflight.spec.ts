import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

/**
 * The customer payment page is a secure browser/provider handoff. MCP may
 * request its creation only after approval; neither interface can charge a
 * card directly or expose Stripe credentials.
 *
 * This E2E proves PDF and ledger equivalence, default checkout rejection,
 * owner isolation and no sensitive data in delegated model responses. A
 * configured Stripe live/sandbox success flow remains a separate acceptance
 * gate; do not use this test by itself to check the 93-case payment row.
 */
test("PARITY:PARITY-billing-pdf-ledger-checkout-preflight compares real browser and delegated MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const userClient=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const signed=await userClient.auth.signInWithPassword(SEED_TEACHER);
 expect(signed.error).toBeNull();
 const teacherId=signed.data.user!.id;
 const marker=randomUUID();
 const guardian=await admin.from("guardians").insert({
   teacher_id:teacherId,name:"Billing preview "+marker.slice(0,8),
   email:"billing-parity-"+marker+"@example.com",portal_token:randomUUID(),
 }).select("id,portal_token").single();
 expect(guardian.error).toBeNull();
 const invoice=await admin.from("invoices").insert({
   teacher_id:teacherId,guardian_id:guardian.data!.id,status:"sent",
   period_start:"2045-03-01",period_end:"2045-03-31",currency:"USD",
   subtotal_cents:6300,
 }).select("id").single();
 expect(invoice.error).toBeNull();
 const invoiceId=invoice.data!.id as string;
 const line=await admin.from("invoice_items").insert({
   invoice_id:invoiceId,kind:"lesson",
   description:"Synthetic bishop endgame lesson",quantity:1,
   unit_cents:6300,amount_cents:6300,sort_order:0,
 });
 expect(line.error).toBeNull();
 const payment=await admin.from("payments").insert({
   invoice_id:invoiceId,amount_cents:1700,method:"manual",
   note:"Synthetic cash receipt",external_id:"manual-"+marker,
 });
 expect(payment.error).toBeNull();

 const withoutApproval=await call("ccp_v1_billing_invoice_pdf",{invoiceId});
 expect(withoutApproval.error?.code).toBe("VALIDATION_ERROR");
 const pdf=await call("ccp_v1_billing_invoice_pdf",{invoiceId,confirmed:true});
 expect(pdf.error).toBeUndefined();
 expect(pdf.data.mimeType).toBe("application/pdf");
 const decoded=Buffer.from(pdf.data.base64 as string,"base64");
 expect(decoded.subarray(0,5).toString()).toBe("%PDF-");
 expect(decoded.length).toBeGreaterThan(500);
 const websitePdf=await page.request.get("/api/billing/invoices/"+invoiceId+"/pdf");
 expect(websitePdf.status(),await websitePdf.text()).toBe(200);
 expect(websitePdf.headers()["content-type"]).toContain("application/pdf");
 expect(websitePdf.headers()["cache-control"]).toContain("no-store");
 const webBytes=await websitePdf.body();
 expect(webBytes.subarray(0,5).toString()).toBe("%PDF-");
 expect(webBytes.length).toBeGreaterThan(500);

 const withoutExportApproval=await call("ccp_v1_billing_payments_export",{});
 expect(withoutExportApproval.error?.code).toBe("VALIDATION_ERROR");
 const exportByModel=await call("ccp_v1_billing_payments_export",{confirmed:true});
 expect(exportByModel.error).toBeUndefined();
 const websiteCsv=await page.request.get("/api/billing/export");
 expect(websiteCsv.status(),await websiteCsv.text()).toBe(200);
 const csvText=await websiteCsv.text();
 const row=(csv:string)=>csv.split("\n").find(x=>x.includes(invoiceId));
 expect(row(csvText)).toBeTruthy();
 expect(row(exportByModel.data.csv as string)).toBe(row(csvText));
 expect(JSON.stringify({pdf:pdf.data,ledger:exportByModel.data}))
   .not.toContain(guardian.data!.portal_token);

 // An unconfirmed AI request cannot start a checkout, regardless of whether
 // the studio happens to have a payment provider configured.
 const unconfirmed=await call("ccp_v1_billing_invoice_checkout",{
   invoiceId,confirmed:true,
 });
 expect(unconfirmed.error?.code).toBe("VALIDATION_ERROR");
 const foreignPdf=await call("ccp_v1_billing_invoice_pdf",{
   invoiceId:randomUUID(),confirmed:true,
 });
 expect(foreignPdf.error?.code).toBe("NOT_FOUND");
 expect((await page.request.get("/api/billing/invoices/"+randomUUID()+"/pdf")).status()).toBe(404);

 // The CI studio does not configure a Stripe payment provider. Compare the
 // safe failure response rather than making any external payment request.
 const policy=await page.request.get("/api/settings/policy");
 expect(policy.status(),await policy.text()).toBe(200);
 const currentPolicy=await policy.json();
 if(currentPolicy.payment_provider!=="stripe"){
   const browserCheckout=await page.request.post("/api/billing/invoices/"+invoiceId+"/checkout");
   expect(browserCheckout.status()).toBe(400);
   expect(await browserCheckout.json()).toMatchObject({
     error:"Stripe is not configured for this studio",
   });
   const modelCheckout=await call("ccp_v1_billing_invoice_checkout",{
     invoiceId,confirmed:true,confirmedExternal:true,
   });
   expect(modelCheckout.error?.code).toBe("VALIDATION_ERROR");
   expect(JSON.stringify(modelCheckout)).not.toContain("sk_");
 }
});
