import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";
import {insertTestBillingAccount} from "./helpers/canonical-payer";
import {addDays,toLocalDateString} from "../lib/schedule";

test("PARITY:PARITY-professional-credit-expiry reads exact active issued packages with effective expiration and no inferred funding",async({page,request})=>{
 test.setTimeout(120_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const password="SyntheticExpiry123!";
 const zone="Pacific/Kiritimati";
 const asOf=toLocalDateString(new Date(),zone);
 const day=(n:number)=>addDays(asOf,n);
 const ids:string[]=[];
 async function insert(table:string,row:Record<string,unknown>){
  const result=await admin.from(table).insert(row).select("id").single();
  expect(result.error,table).toBeNull();
  return result.data!.id as string;
 }
 async function tenant(){
  const email="credit-expiry-"+randomUUID()+"@example.invalid";
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(result.error).toBeNull();
  const id=result.data.user!.id;
  ids.push(id);
  expect((await admin.from("teachers").insert({id,email,display_name:"Expiry fixture",preferred_locale:"en",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,id,10,5);
  return {id,email};
 }
 try{
  const owner=await tenant(),foreign=await tenant(),teacher_id=owner.id;
  const place=(teacher_id:string,name:string)=>insert("workplaces",{teacher_id,name,timezone:zone,currency:"USD",locale:"en",kind:"professional",policy:{}});
  const first=await place(teacher_id,"Island Workplace");
  const other=await place(teacher_id,"Other Credit Workplace");
  const outside=await place(foreign.id,"Foreign Credit Workplace");
  const student=await insert("students",{teacher_id,name:"Synthetic Credit Learner"});
  const archived=await insert("students",{teacher_id,name:"Archived Credit Learner"});
  for(const [student_id,workplace_id] of [[student,first],[student,other],[archived,first]]){
   expect((await admin.from("workplace_enrollments").insert({teacher_id,student_id,workplace_id,
    starts_on:day(-60),source:"manual"})).error).toBeNull();
  }
  const pay=await insertTestBillingAccount(admin,{teacherId:teacher_id,displayName:"Synthetic private payer"});
  expect(pay.error).toBeNull();
  const syntheticInvoices:string[]=[];
  const pack=async(student_id:string,workplace_id:string,n:number,opts:{status?:string;starts?:number;units?:number}={})=>{
   const invoice_id=await insert("invoices",{teacher_id,billing_account_id:pay.data!.id,status:opts.status??"sent",
    period_start:day(-60),period_end:day(-30),currency:"USD",subtotal_cents:7500});
   syntheticInvoices.push(invoice_id);
   return insert("credit_packages",{teacher_id,student_id,workplace_id,invoice_id,
    credits:opts.units??3,duration_minutes:45,price_cents:7500,starts_on:day(opts.starts??-30),expires_on:day(n)});
  };
  const included=await pack(student,first,0);
  const extendedInto=await pack(student,first,-2);
  const extendedOut=await pack(student,first,2);
  const atEnd=await pack(student,first,14);
  const exhausted=await pack(student,first,4);
  const notIssued=await pack(student,first,5,{status:"draft"});
  const future=await pack(student,first,6,{starts:2});
  const elsewhere=await pack(student,other,3);
  const held=await pack(archived,first,3);
  const adjust=async(package_id:string,kind:string,credits_delta:number,new_expires_on:string|null)=>{
   const r=await admin.from("credit_adjustment_events").insert({teacher_id,student_id:student,package_id,kind,credits_delta,
    new_expires_on,approved_request_id:randomUUID(),approval_reason:"Only synthetic fixture entitlement evidence"});
   expect(r.error).toBeNull();
  };
  await adjust(extendedInto,"expiry_extension",0,day(5));
  await adjust(extendedOut,"expiry_extension",0,day(20));
  await adjust(exhausted,"forfeiture",-3,null);
  await adjust(atEnd,"manual_grant",2,null);
  const tool=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
  expect((await tool("ccp_workplace_context_set",{selectedWorkplaceId:first,expectedSelectedWorkplaceId:null,confirmed:true})).error).toBeUndefined();
  const preview=await tool("ccp_students_lifecycle_preview",{studentId:archived});
  expect(preview.error).toBeUndefined();
  expect(preview.data.canArchive).toBe(true);
  const archive=await tool("ccp_students_lifecycle_commit",{
   studentId:archived,mode:"archive",expectedUpdatedAt:preview.data.expectedUpdatedAt,
   selectedWorkplaceIds:[],requestId:randomUUID(),reason:"Synthetic archival holds existing credits",confirmed:true,
  });
  expect(archive.error).toBeUndefined();
  expect(archive.data.archived).toBe(true);

  const snapshot=async()=>Promise.all(["credit_packages","credit_adjustment_events","credit_redemptions","invoices","payments"].map(async table=>{
   const q=admin.from(table).select("*").order("id");
   const rows=await (table==="payments"?q.in("invoice_id",syntheticInvoices):q.eq("teacher_id",teacher_id));
   expect(rows.error,table).toBeNull();return rows.data;
  }));
  const before=await snapshot();
  const endpoint="/api/dashboard/credit-expiry";
  const route=(id:string)=>endpoint+"?workplaceId="+id;
  const response=await page.request.get(route(first));
  expect(response.status(),await response.text()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const web=await response.json();
  const model=await tool("ccp_professional_credit_expiry_get",{workplaceId:first});
  expect(model.error).toBeUndefined();expect(model.data).toEqual(web);
  expect(web).toMatchObject({status:"ready",workplaceId:first,asOf,through:day(14),timeZone:zone,
   packages:[
    {packageId:included,studentId:student,expiresOn:asOf,unredeemedUnits:3},
    {packageId:extendedInto,studentId:student,expiresOn:day(5),unredeemedUnits:3},
    {packageId:atEnd,studentId:student,expiresOn:day(14),unredeemedUnits:5},
   ],truncated:false});
  for(const hidden of [extendedOut,exhausted,notIssued,future,elsewhere,held,"Synthetic private payer"]){
   expect(JSON.stringify(web)).not.toContain(hidden);
  }
  expect((await page.request.get(route(outside))).status()).toBe(404);
  expect((await tool("ccp_professional_credit_expiry_get",{workplaceId:outside})).error?.code).toBe("WORKPLACE_NOT_FOUND");
  expect((await page.request.get(endpoint)).status()).toBe(400);
  expect((await page.request.get(route(first)+"&workplaceId="+other)).status()).toBe(400);
  await page.setViewportSize({width:320,height:820});
  await page.goto("/dashboard");
  const region=page.getByRole("region",{name:"Prepaid packages nearing expiry"});
  await expect(region.getByRole("listitem")).toHaveCount(0);
  await region.getByRole("link",{name:"Review upcoming package expiries"}).focus();
  await page.keyboard.press("Enter");
  await expect(region.getByText(/not a spending forecast or a payment record/)).toBeVisible();
  await expect(region.getByRole("listitem")).toHaveCount(3);
  for(const link of await region.getByRole("link",{name:"Open credit details for Synthetic Credit Learner"}).all())
   await expect(link).toHaveAttribute("href","/students/"+student);
  expect(await region.evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(await region.evaluate(el=>el.clientWidth)+1);
  expect(await snapshot()).toEqual(before);
 }finally{
  for(const id of ids)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
