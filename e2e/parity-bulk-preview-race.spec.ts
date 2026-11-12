import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";
import {mailpitMessagesTo} from "./helpers/mailpit";

test("PARITY:PARITY-bulk-preview-recipient-revision-race requires reviewed fresh recipient digest",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const signed=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await signed.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const teacherId=(await signed.auth.getUser()).data.user!.id;
 const firstEmail="preview-first-"+randomUUID()+"@example.com";
 const finalEmail="preview-final-"+randomUUID()+"@example.com";
 const family=await admin.from("guardians").insert({
  teacher_id:teacherId,name:"Preview family "+randomUUID(),email:firstEmail,
  portal_token:randomUUID(),
 }).select("id").single();
 expect(family.error).toBeNull();
 const row=await admin.from("invoices").insert({
  teacher_id:teacherId,guardian_id:family.data!.id,status:"draft",
  period_start:"2059-05-01",period_end:"2059-05-31",
  subtotal_cents:5000,currency:"USD",
 }).select("id").single();
 expect(row.error).toBeNull();
 const id=row.data!.id as string;
 expect((await admin.from("invoice_items").insert({
  invoice_id:id,kind:"lesson",lesson_id:null,
  description:"Synthetic bishop training",quantity:1,unit_cents:5000,
  amount_cents:5000,sort_order:0,
 })).error).toBeNull();
 const first=await page.request.post("/api/billing/invoices/bulk",{
  data:{action:"preview",ids:[id],includeRecipients:true},
 });
 expect(first.status(),await first.text()).toBe(200);
 const snapshot=await first.json();
 expect(snapshot.results[0].preview.recipients).toEqual([firstEmail]);
 const toolView=await call("ccp_v1_billing_invoices_bulk_preview",{
  ids:[id],includeRecipients:true,confirmed:true,
 });
 expect(toolView.error).toBeUndefined();
 expect(toolView.data).toEqual(snapshot);
 const secretWithoutApproval=await call("ccp_v1_billing_invoices_bulk_preview",{
  ids:[id],includeRecipients:true,
 });
 expect(secretWithoutApproval.error?.code).toBe("VALIDATION_ERROR");
 expect((await admin.from("guardians").update({email:finalEmail})
  .eq("id",family.data!.id)).error).toBeNull();
 const stale=await call("ccp_v1_billing_invoices_bulk",{
  ids:[id],action:"send",previewDigest:snapshot.previewDigest,
  confirmed:true,confirmedEmail:true,
 });
 expect(stale.error?.code).toBe("CONFLICT");
 const afterStale=await page.request.get("/api/billing/invoices/"+id);
 expect((await afterStale.json()).status).toBe("draft");
 expect(await mailpitMessagesTo(request,firstEmail)).toHaveLength(0);
 expect(await mailpitMessagesTo(request,finalEmail)).toHaveLength(0);
 const fresh=await call("ccp_v1_billing_invoices_bulk_preview",{
  ids:[id],includeRecipients:true,confirmed:true,
 });
 expect(fresh.error).toBeUndefined();
 expect(fresh.data.previewDigest).not.toBe(snapshot.previewDigest);
 expect(fresh.data.results[0].preview.recipients).toEqual([finalEmail]);
 // Both transports use the SAME confirmed snapshot. Only one email claim wins.
 const [browser,agent]=await Promise.all([
  page.request.post("/api/billing/invoices/bulk",{data:{
   action:"send",ids:[id],confirmedEmail:true,
   previewDigest:fresh.data.previewDigest,
  }}),
  call("ccp_v1_billing_invoices_bulk",{
   ids:[id],action:"send",previewDigest:fresh.data.previewDigest,
   confirmed:true,confirmedEmail:true,
  }),
 ]);
 const webOk=browser.status()===200 && (await browser.json()).succeeded===1;
 const mcpOk=agent.error===undefined&&agent.data.succeeded===1;
 expect(Number(webOk)+Number(mcpOk)).toBe(1);
 await expect.poll(async()=> (await mailpitMessagesTo(request,finalEmail)).length,{
  timeout:10000,
 }).toBe(1);
 expect(await mailpitMessagesTo(request,firstEmail)).toHaveLength(0);
 const mcpInvoice=await call("ccp_v1_billing_invoice_detail",{invoiceId:id});
 expect(mcpInvoice.error).toBeUndefined();
 expect(mcpInvoice.data.status).toBe("sent");
});
