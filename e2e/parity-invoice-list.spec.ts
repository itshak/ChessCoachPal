import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-billing-invoice-list-detail reads owned totals and redacts confidential fields",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const login=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(login.error).toBeNull();
 const teacherId=login.data.user!.id,stamp=randomUUID().slice(0,9);
 const family=await admin.from("guardians").insert({
   teacher_id:teacherId,name:"Statement family "+stamp,
   email:"statement-"+stamp+"@example.com",portal_token:randomUUID(),
 }).select("id").single();
 expect(family.error).toBeNull();
 const invoice=await admin.from("invoices").insert({
   teacher_id:teacherId,guardian_id:family.data!.id,
   status:"sent",period_start:"2042-04-01",period_end:"2042-04-30",
   currency:"ILS",subtotal_cents:18750,
 }).select("id").single();
 expect(invoice.error).toBeNull();
 const invoiceId=invoice.data!.id as string;
 const browser=await page.request.get("/api/billing/invoices/"+invoiceId);
 expect(browser.status(),await browser.text()).toBe(200);
 const site=await browser.json() as Record<string,any>;
 expect(site.subtotal_cents).toBe(18750);
 expect(site.currency).toBe("ILS");
 const detail=await call("ccp_v1_billing_invoice_detail",{invoiceId});
 expect(detail.error).toBeUndefined();
 expect(detail.data).toMatchObject({
   id:invoiceId,status:"sent",currency:"ILS",subtotal_cents:18750,
 });
 expect(detail.data.guardians.email).toBeUndefined();
 expect(detail.data.guardians.portal_token).toBeUndefined();
 expect(detail.data.stripe_checkout_url).toBeUndefined();
 expect(site.guardians.email).toContain("@example.com");
 const list=await call("ccp_v1_billing_invoices_list",{
   status:"sent",limit:100,offset:0,
 });
 expect(list.error).toBeUndefined();
 expect(list.data.invoices.some((x:{id:string;subtotal_cents:number})=>
   x.id===invoiceId&&x.subtotal_cents===site.subtotal_cents)).toBe(true);
 expect(list.data.invoices.every((x:{email?:string;portal_token?:string})=>
   !x.email&&!x.portal_token)).toBe(true);
 const privateDetail=await call("ccp_v1_billing_invoice_detail",{
   invoiceId,includePrivate:true,confirmed:true,
 });
 expect(privateDetail.error).toBeUndefined();
 expect(privateDetail.data.guardians.email).toBe(site.guardians.email);
 expect(privateDetail.data.guardians.portal_token).toBeUndefined();
});
