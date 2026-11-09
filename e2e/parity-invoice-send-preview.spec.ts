import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-billing-send-preview checks totals and contacts without emailing or leaking secrets",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const signed=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(signed.error).toBeNull();
 const teacherId=signed.data.user!.id;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="preview-invoice-"+randomUUID()+"@example.com";
 const family=await admin.from("guardians").insert({
   teacher_id:teacherId,name:"Invoice preview household",
   email,portal_token:randomUUID(),
 }).select("id,portal_token").single();
 expect(family.error).toBeNull();
 const invoice=await admin.from("invoices").insert({
   teacher_id:teacherId,guardian_id:family.data!.id,status:"draft",
   period_start:"2042-06-01",period_end:"2042-06-30",currency:"ILS",
   subtotal_cents:0,
 }).select("id").single();
 expect(invoice.error).toBeNull();
 const invoiceId=invoice.data!.id as string;
 const reviewed=await call("ccp_v1_billing_invoice_draft_update",{
   invoiceId,changes:{items:[{
     description:"Chess lessons",quantity:2,unitCents:4500,amountCents:9000,
   }]},confirmed:true,
 });
 expect(reviewed.error).toBeUndefined();
 const path="/api/billing/invoices/"+invoiceId+"/send";
 const website=await page.request.get(path);
 expect(website.status(),await website.text()).toBe(200);
 const preview=await website.json();
 expect(preview.subtotalCents).toBe(9000);
 expect(preview.itemCount).toBe(1);
 expect(preview.recipientCount).toBe(1);
 expect(preview.deliveryPossible).toBe(true);
 expect(preview.pdfReady).toBe(true);
 expect(preview.messageSubject).toContain("Invoice");
 expect(preview.recipients).toBeUndefined();
 const mcp=await call("ccp_v1_billing_invoice_send_preview",{invoiceId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(preview);
 expect(JSON.stringify(mcp.data)).not.toContain(family.data!.portal_token);
 const refused=await call("ccp_v1_billing_invoice_send_preview",{
   invoiceId,includeRecipients:true,
 });
 expect(refused.error?.code).toBe("VALIDATION_ERROR");
 const approved=await call("ccp_v1_billing_invoice_send_preview",{
   invoiceId,includeRecipients:true,confirmed:true,
 });
 expect(approved.error).toBeUndefined();
 expect(approved.data.recipients).toEqual([email]);
 const browserPrivate=await page.request.get(path+"?includeRecipients=true");
 expect(browserPrivate.status()).toBe(200);
 expect(await browserPrivate.json()).toEqual(approved.data);
 const invoiceAfter=await page.request.get("/api/billing/invoices/"+invoiceId);
 expect(invoiceAfter.status()).toBe(200);
 expect((await invoiceAfter.json()).status).toBe("draft");
});
