import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";
import {mailpitMessagesTo} from "./helpers/mailpit";

test("PARITY:PARITY-billing-send-concurrent-claim rejects duplicate website/MCP external email attempts",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const signed=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(signed.error).toBeNull();
 const recipient="send-once-"+randomUUID()+"@example.com";
 const guardian=await admin.from("guardians").insert({
   teacher_id:signed.data.user!.id,name:"Send-once family "+randomUUID(),
   email:recipient,portal_token:randomUUID(),
 }).select("id").single();
 expect(guardian.error).toBeNull();
 const invoice=await admin.from("invoices").insert({
   teacher_id:signed.data.user!.id,guardian_id:guardian.data!.id,
   status:"draft",period_start:"2042-11-01",period_end:"2042-11-30",
   currency:"USD",subtotal_cents:12000,
 }).select("id").single();
 expect(invoice.error).toBeNull();
 const invoiceId=invoice.data!.id as string;
 const item=await admin.from("invoice_items").insert({
   invoice_id:invoiceId,session_id:null,student_id:null,kind:"lesson",
   description:"Chess lesson package",quantity:1,unit_cents:12000,
   amount_cents:12000,sort_order:0,
 });
 expect(item.error).toBeNull();
 const previewSite=await page.request.get("/api/billing/invoices/"+invoiceId+"/send");
 expect(previewSite.status(),await previewSite.text()).toBe(200);
 const previewMcp=await call("ccp_v1_billing_invoice_send_preview",{invoiceId});
 expect(previewMcp.error).toBeUndefined();
 expect(previewMcp.data).toEqual(await previewSite.json());
 expect(previewMcp.data.subtotalCents).toBe(12000);
 expect(previewMcp.data.recipientCount).toBe(1);
 const unapproved=await call("ccp_v1_billing_invoice_send",{
   invoiceId,confirmed:true,
 });
 expect(unapproved.error?.code).toBe("VALIDATION_ERROR");
 // CI uses Mailpit SMTP: this exercises a real provider response while
 // never sending external mail or touching real family inboxes.
 const [website,mcp]=await Promise.all([
   page.request.post("/api/billing/invoices/"+invoiceId+"/send"),
   call("ccp_v1_billing_invoice_send",{
     invoiceId,confirmed:true,confirmedEmail:true,
   }),
 ]);
 const siteWon=website.status()===200;
 const mcpWon=mcp.error===undefined;
 expect(Number(siteWon)+Number(mcpWon)).toBe(1);
 if(!siteWon)expect(website.status()).toBe(409);
 if(!mcpWon)expect(mcp.error?.code).toBe("CONFLICT");
 if(siteWon)expect((await website.json()).emailed).toBe(true);
 if(mcpWon)expect(mcp.data.emailed).toBe(true);
 await expect.poll(async()=> (await mailpitMessagesTo(request,recipient)).length,{
   timeout:10000,
 }).toBe(1);
 const delivery=(await mailpitMessagesTo(request,recipient))[0];
 expect(delivery.Subject).toContain("Invoice");
 const browserDetail=await page.request.get("/api/billing/invoices/"+invoiceId);
 expect(browserDetail.status(),await browserDetail.text()).toBe(200);
 const body=await browserDetail.json();
 expect(body.status).toBe("sent");
 expect(body.sent_at).toBeTruthy();
 const model=await call("ccp_v1_billing_invoice_detail",{invoiceId});
 expect(model.error).toBeUndefined();
 expect(model.data.status).toBe("sent");
 const duplicateSite=await page.request.post("/api/billing/invoices/"+invoiceId+"/send");
 expect(duplicateSite.status()).toBe(409);
 const duplicateMcp=await call("ccp_v1_billing_invoice_send",{
   invoiceId,confirmed:true,confirmedEmail:true,
 });
 expect(duplicateMcp.error?.code).toBe("CONFLICT");
 const final=await page.request.get("/api/billing/invoices/"+invoiceId);
 expect(final.status()).toBe(200);
 expect((await final.json()).sent_at).toBe(body.sent_at);
 expect((await mailpitMessagesTo(request,recipient)).length).toBe(1);
});
