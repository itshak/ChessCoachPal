import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-billing-export-escaped-ledger compares CSV and prevents formula execution",async({page,request})=>{
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
 const teacherId=signed.data.user!.id,marker=randomUUID();
 const guardian=await admin.from("guardians").insert({
   teacher_id:teacherId,name:"משפחת שחמט "+marker.slice(0,6),
   portal_token:randomUUID(),
 }).select("id").single();
 expect(guardian.error).toBeNull();
 const invoice=await admin.from("invoices").insert({
   teacher_id:teacherId,guardian_id:guardian.data!.id,status:"sent",
   period_start:"2042-05-01",period_end:"2042-05-31",currency:"ILS",
   subtotal_cents:8500,
 }).select("id").single();
 expect(invoice.error).toBeNull();
 const invoiceId=invoice.data!.id as string;
 const payment=await admin.from("payments").insert({
   invoice_id:invoiceId,amount_cents:2300,method:"manual",
   note:"=2+2 "+marker,external_id:"manual-"+marker,
 });
 expect(payment.error).toBeNull();
 const missingApproval=await call("ccp_v1_billing_payments_export",{});
 expect(missingApproval.error?.code).toBe("VALIDATION_ERROR");
 const mcp=await call("ccp_v1_billing_payments_export",{confirmed:true});
 expect(mcp.error).toBeUndefined();
 const browser=await page.request.get("/api/billing/export");
 expect(browser.status(),await browser.text()).toBe(200);
 const websiteText=await browser.text();
 const mcpText=mcp.data.csv as string;
 const rowOf=(csv:string)=>csv.split("\n").find(line=>line.includes(invoiceId));
 const row=rowOf(websiteText),modelRow=rowOf(mcpText);
 expect(row).toBeTruthy();
 expect(modelRow).toBe(row);
 expect(row).toContain("משפחת שחמט");
 expect(row).toContain("'=2+2 "+marker);
 expect(row).toContain("23.00");
 expect(row).not.toContain(",=2+2 ");
 expect(mcp.data.rowCount).toBeGreaterThan(0);
});
