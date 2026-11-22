import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import type {TestMcpReply} from "./delegated-mcp";

export type TestMcpInvoke=(name:string,args:Record<string,unknown>)=>Promise<TestMcpReply>;

/** Canonical synthetic financial identity: a contact does not imply a payer,
 * and a payer does not imply guest access. Create the explicit workplace-local
 * effective-dated assignment AFTER the student is enrolled.
 */
export async function createAssignedPayer(call:TestMcpInvoke,input:{
 studentId:string;workplaceId:string;
 effectiveFrom?:string;effectiveTo?:string|null;
 displayName?:string;accountKind?:"person"|"organization";
 contactEmail?:string;
 mayReceiveMessages?:boolean;
}):Promise<{billingAccountId:string;contactId:string|null}>{
 let contactId:string|null=null;
 if(input.contactEmail){
  const contact=await call("ccp_contacts_create",{
   displayName:input.displayName??"Invoice contact",
   email:input.contactEmail,kind:"person",
   idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  contactId=contact.data.id as string;
  const link=await call("ccp_student_contacts_link",{
   studentId:input.studentId,contactId,
   relationshipLabel:"Payer contact",
   mayReceiveMessages:input.mayReceiveMessages??true,
   idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(link.error).toBeUndefined();
 }
 const payer=await call("ccp_billing_accounts_create",{
  displayName:input.displayName??"Test payer "+randomUUID(),
  accountKind:input.accountKind??"person",
  ...(contactId?{contactId}:{}),
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(payer.error).toBeUndefined();
 const billingAccountId=payer.data.id as string;
 const assigned=await call("ccp_student_billing_assignments_create",{
  studentId:input.studentId,workplaceId:input.workplaceId,billingAccountId,
  effectiveFrom:input.effectiveFrom??new Date().toISOString().slice(0,10),
  effectiveTo:input.effectiveTo??null,
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(assigned.error).toBeUndefined();
 return {billingAccountId,contactId};
}

import type {SupabaseClient} from "@supabase/supabase-js";

/** ADMIN-ONLY isolated test fixture: real canonical billing account and its
 * optional separately created contact. Never creates a payer assignment,
 * an email permission, a portal grant, or a provider receipt.
 */
export async function insertTestBillingAccount(db:SupabaseClient,input:{
  teacherId:string;displayName:string;email?:string|null;
  preferredLocale?:"en"|"he"|"ru"|null;
  accountKind?:"person"|"organization";
}):Promise<{data:{id:string;contactId:string|null}|null;error:{message:string}|null}>{
  let contactId:string|null=null;
  if(input.email){
    const {data,error}=await db.from("contacts").insert({
      teacher_id:input.teacherId,display_name:input.displayName,
      email:input.email,preferred_locale:input.preferredLocale??null,
    }).select("id").single();
    if(error||!data)return {data:null,error:error??{message:"Fixture contact creation failed"}};
    contactId=data.id;
  }
  const {data,error}=await db.from("billing_accounts").insert({
    teacher_id:input.teacherId,display_name:input.displayName,
    account_kind:input.accountKind??"person",contact_id:contactId,
  }).select("id").single();
  return {data:data?{id:data.id,contactId}:null,error};
}

import type {Page} from "@playwright/test";

/** The only guest credential accepted by the current portal: a new explicit
 * teacher-attested contact relationship and an issued scope-limited grant.
 * The capability is returned to a browser, never delegated to MCP.
 */
export async function createScopedPortalAccess(call:TestMcpInvoke,page:Page,input:{
 studentId:string;workplaceId:string;permissions:Array<"cancel"|"calendar"|"event_rsvp">;
}):Promise<{token:string;contactId:string;grantId:string}>{
 const contact=await call("ccp_contacts_create",{
  displayName:"Scoped portal contact "+randomUUID(),
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(contact.error).toBeUndefined();
 const contactId=contact.data.id as string;
 const linked=await call("ccp_student_contacts_link",{
  studentId:input.studentId,contactId,
  relationshipLabel:"Student contact",idempotencyKey:randomUUID(),
  confirmed:true,
 });
 expect(linked.error).toBeUndefined();
 const grant=await call("ccp_portal_grants_create",{
  studentId:input.studentId,workplaceId:input.workplaceId,contactId,
  permissions:input.permissions,
  expiresAt:new Date(Date.now()+30*86400000).toISOString(),
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(grant.error).toBeUndefined();
 const grantId=grant.data.id as string;
 const issued=await page.request.post("/api/portal-grants/"+grantId+"/issue",{
  headers:{origin:"http://localhost:3000"},
  data:{expectedRevision:1,confirmed:true},
 });
 expect(issued.status(),await issued.text()).toBe(200);
 const url=(await issued.json()).url as string;
 const token=new URL(url).pathname.split("/").filter(Boolean).pop()!;
 expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
 return {token,contactId,grantId};
}

/** Synthetic service-role E2E setup only: attach EVERY invoice line to a real
 * enrolled student, original teaching occurrence and an explicit historical
 * payer and messaging authorization. Never called by runtime code.
 */
export async function prepareSendableInvoice(db:SupabaseClient,input:{
 teacherId:string;invoiceId:string;billingAccountId:string;contactId:string;
 periodStart:string;description?:string;amountCents?:number;
}):Promise<{studentId:string;workplaceId:string}>{
 const add=async(table:string,fields:Record<string,unknown>)=>{
  const {data,error}=await db.from(table).insert(fields).select("id").single();
  if(error||!data)throw new Error("Synthetic "+table+" fixture: "+(error?.message??"no record"));
  return data.id as string;
 };
 const studentId=await add("students",{teacher_id:input.teacherId,
  name:"Invoice student "+randomUUID()});
 const workplaceId=await add("workplaces",{teacher_id:input.teacherId,
  name:"Invoice attendance workplace "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{}});
 // Fixture-only: the generated lesson must be within verified attendance.
 // Never backdate a payer more than the explicit synthetic enrollment.
 await add("workplace_enrollments",{teacher_id:input.teacherId,workplace_id:workplaceId,
  student_id:studentId,starts_on:input.periodStart});
 await add("student_contacts",{teacher_id:input.teacherId,contact_id:input.contactId,
  student_id:studentId,relationship_label:"Invoice authorized recipient",
  may_receive_messages:true,is_legal_guardian:false});
 await add("student_billing_assignments",{teacher_id:input.teacherId,
  workplace_id:workplaceId,student_id:studentId,billing_account_id:input.billingAccountId,
  effective_from:input.periodStart});
 const {data:invoice,error:invoiceError}=await db.from("invoices")
  .select("period_start,subtotal_cents,currency").eq("teacher_id",input.teacherId)
  .eq("id",input.invoiceId).single();
 if(invoiceError||!invoice)throw new Error("Invoice fixture not found: "+invoiceError?.message);
 const {data:original,error:itemsError}=await db.from("invoice_items")
  .select("id,kind,quantity,unit_cents,amount_cents").eq("invoice_id",input.invoiceId)
  .order("sort_order");
 if(itemsError)throw new Error("Invoice lines lookup: "+itemsError.message);
 const items=original?.length?original:[{id:null,kind:"lesson",quantity:1,
   unit_cents:input.amountCents??invoice.subtotal_cents,
   amount_cents:input.amountCents??invoice.subtotal_cents}];
 for(let index=0;index<items.length;index++){
  const item=items[index];
  if(item.kind==="credit_package")throw new Error("Credit package needs its real provenance fixture");
  // Spread synthetic lessons over deterministic, fixture-private slots.
  // Multiple invoice-send cases run against the same teacher in CI; all
  // starting at 10:00 on the first day violates the teacher overlap guard.
  const slot=randomUUID().replaceAll("-","");
  const day=1+(parseInt(slot.slice(0,4),16)%26);
  const hour=8+(parseInt(slot.slice(4,8),16)%11);
  const startsAt=invoice.period_start.slice(0,8)+String(day).padStart(2,"0")+
    "T"+String(hour).padStart(2,"0")+":00:00Z";
  // Other seeded tests may have already used this teacher's hour.
  // Retry ONLY on the expected synthetic overlap, never mask an integrity error.
  let sessionId:string|null=null;
  let candidate=startsAt;
  for(let attempt=0;attempt<160;attempt++){
    const {data,error}=await db.from("teaching_sessions").insert({
      teacher_id:input.teacherId,workplace_id:workplaceId,student_id:studentId,
      title:"Synthetic billed chess lesson "+randomUUID(),
      starts_at:candidate,duration_minutes:60,local_timezone:"UTC",
    }).select("id").single();
    if(!error&&data){sessionId=data.id as string;break;}
    if(!error?.message.includes("SESSION_CONFLICT"))
      throw new Error("Synthetic teaching_sessions fixture: "+(error?.message??"no record"));
    // Probe distinct UTC hour slots in the invoice month. Fixtures run
    // serially; no production scheduler or conflict rule is weakened.
    const offset=attempt+1;
    const baseHour=8;
    const dayIndex=Math.floor(offset/16);
    const hourIndex=offset%16;
    const safeDay=1+((day-1+dayIndex)%28);
    candidate=invoice.period_start.slice(0,8)+String(safeDay).padStart(2,"0")+
      "T"+String(baseHour+hourIndex).padStart(2,"0")+":00:00Z";
  }
  if(!sessionId)throw new Error("No conflict-free synthetic billed lesson slot");
  // The session trigger may have frozen this participant already.
  const {error:freezeError}=await db.from("session_participants").upsert({
   teacher_id:input.teacherId,session_id:sessionId,student_id:studentId,
  },{onConflict:"session_id,student_id",ignoreDuplicates:true});
  if(freezeError)throw new Error("Invoice participant fixture: "+freezeError.message);
  if(item.id){
   const {error:updateError}=await db.from("invoice_items").update({
    kind:"lesson",session_id:sessionId,student_id:studentId,
   }).eq("id",item.id);
   if(updateError)throw new Error("Invoice line fixture: "+updateError.message);
  }else{
   const {error:addError}=await db.from("invoice_items").insert({
    invoice_id:input.invoiceId,session_id:sessionId,student_id:studentId,
    kind:"lesson",description:input.description??"Synthetic billed chess lesson",
    quantity:item.quantity,unit_cents:item.unit_cents,amount_cents:item.amount_cents,
    sort_order:0,
   });
   if(addError)throw new Error("Invoice line fixture: "+addError.message);
  }
 }
 return {studentId,workplaceId};
}
