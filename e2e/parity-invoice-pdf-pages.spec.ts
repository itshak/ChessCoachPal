import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {PDFDocument} from "pdf-lib";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-invoice-pdf-multipage-private-export preserves 150 line items and owner isolation",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const teacher=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await teacher.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const teacherId=(await teacher.auth.getUser()).data.user!.id;
 const portalToken=randomUUID();
 const guardian=await admin.from("guardians").insert({
  teacher_id:teacherId,name:"Multi-page family "+randomUUID(),
  email:"multipage-"+randomUUID()+"@example.com",
  portal_token:portalToken,
 }).select("id").single();
 expect(guardian.error).toBeNull();
 const inv=await admin.from("invoices").insert({
  teacher_id:teacherId,guardian_id:guardian.data!.id,
  period_start:"2056-02-01",period_end:"2056-02-28",
  currency:"USD",status:"sent",subtotal_cents:15000,
  notes:"Exam preparation and tournament games. ".repeat(80),
 }).select("id").single();
 expect(inv.error).toBeNull();
 const id=inv.data!.id as string;
 const items=Array.from({length:150},(_,index)=>({
  invoice_id:id,kind:"lesson",session_id:null,student_id:null,
  description:"Unique chess lesson "+String(index+1).padStart(3,"0"),
  quantity:1,unit_cents:100,amount_cents:100,sort_order:index,
 }));
 expect((await admin.from("invoice_items").insert(items)).error).toBeNull();
 const website=await page.request.get("/api/billing/invoices/"+id+"/pdf");
 expect(website.status(),await website.text()).toBe(200);
 expect(website.headers()["cache-control"]).toContain("no-store");
 const webBytes=await website.body();
 expect(webBytes.subarray(0,5).toString()).toBe("%PDF-");
 const webPdf=await PDFDocument.load(webBytes);
 expect(webPdf.getPageCount()).toBeGreaterThanOrEqual(4);
 const tool=await call("ccp_v1_billing_invoice_pdf",{
  invoiceId:id,confirmed:true,
 });
 expect(tool.error).toBeUndefined();
 expect(tool.data.mimeType).toBe("application/pdf");
 const toolBytes=Buffer.from(tool.data.base64,"base64");
 const mcpPdf=await PDFDocument.load(toolBytes);
 expect(mcpPdf.getPageCount()).toBe(webPdf.getPageCount());
 expect(toolBytes.length).toBeLessThanOrEqual(512*1024);
 expect(webBytes.toString("latin1")).not.toContain(portalToken);
 expect(toolBytes.toString("latin1")).not.toContain(portalToken);
 const noConsent=await call("ccp_v1_billing_invoice_pdf",{invoiceId:id});
 expect(noConsent.error?.code).toBe("VALIDATION_ERROR");
 // Test another real tenant's existing, owned PDF—not just an unknown UUID.
 const email="foreign-pdf-"+randomUUID()+"@example.com";
 const outsider=await admin.auth.admin.createUser({
  email,password:"SyntheticPdfIsolation-123!",email_confirm:true,
 });
 expect(outsider.error).toBeNull();
 const foreignTeacherId=outsider.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:foreignTeacherId,email,display_name:"Other PDF teacher",
   hosted_enforced:false,
  })).error).toBeNull();
  const otherFamily=await admin.from("guardians").insert({
   teacher_id:foreignTeacherId,name:"Other family",portal_token:randomUUID(),
  }).select("id").single();
  expect(otherFamily.error).toBeNull();
  const otherInvoice=await admin.from("invoices").insert({
   teacher_id:foreignTeacherId,guardian_id:otherFamily.data!.id,
   period_start:"2056-03-01",period_end:"2056-03-31",
   status:"draft",currency:"USD",subtotal_cents:200,
  }).select("id").single();
  expect(otherInvoice.error).toBeNull();
  const foreignId=otherInvoice.data!.id as string;
  expect((await admin.from("invoice_items").insert({
   invoice_id:foreignId,kind:"lesson",session_id:null,student_id:null,
   description:"Other customer's data",quantity:1,unit_cents:200,
   amount_cents:200,sort_order:0,
  })).error).toBeNull();
  const blocked=await page.request.get("/api/billing/invoices/"+foreignId+"/pdf");
  expect(blocked.status()).toBe(404);
  const mcpBlocked=await call("ccp_v1_billing_invoice_pdf",{
   invoiceId:foreignId,confirmed:true,
  });
  expect(mcpBlocked.error?.code).toBe("NOT_FOUND");
 }finally{
  await admin.auth.admin.deleteUser(foreignTeacherId);
 }
});
