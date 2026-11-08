import type { SupabaseClient } from "@supabase/supabase-js";
import { sumAmountCents } from "@/lib/billing";
import { sendInvoice } from "@/lib/server/invoice-send";
export class InvoiceActionError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,msg:string)=>new InvoiceActionError(status,code,msg);
type Db=SupabaseClient;
type InvoiceLine={id?:string;lessonId?:string|null;description:string;quantity:number;
 unitCents:number;amountCents:number};
export type InvoiceDraftEdit={notes?:string;items?:InvoiceLine[]};
async function ownedInvoice(db:Db,teacherId:string,id:string){
 const {data,error}=await db.from("invoices").select("id,status")
   .eq("id",id).eq("teacher_id",teacherId).maybeSingle();
 if(error)throw fail(500,"DATABASE_ERROR","Unable to inspect invoice");
 if(!data)throw fail(404,"NOT_FOUND","Invoice not found");
 return data;
}
export async function teacherInvoiceDelete(db:Db,teacherId:string,id:string){
 const invoice=await ownedInvoice(db,teacherId,id);
 if(!["draft","void"].includes(invoice.status))
  throw fail(409,"CONFLICT","Only draft or void invoices may be deleted");
 const {data,error}=await db.from("invoices").delete()
  .eq("id",id).eq("teacher_id",teacherId).eq("status",invoice.status)
  .select("id").maybeSingle();
 if(error)throw fail(500,"DATABASE_ERROR","Unable to delete invoice");
 if(!data)throw fail(409,"CONFLICT","Invoice status changed; reload before deletion");
 return {ok:true};
}
export async function teacherInvoiceVoid(db:Db,teacherId:string,id:string){
 const invoice=await ownedInvoice(db,teacherId,id);
 if(invoice.status==="paid")throw fail(409,"CONFLICT","Paid invoices cannot be voided");
 if(invoice.status==="void")return {ok:true,alreadyVoid:true};
 const {data:creditPackage,error:creditError}=await db.from("credit_packages")
  .select("id,credit_redemptions(id)").eq("invoice_id",id).maybeSingle();
 if(creditError)throw fail(500,"DATABASE_ERROR","Unable to inspect prepaid credits");
 if((creditPackage?.credit_redemptions as unknown[]|null)?.length)
  throw fail(409,"CREDITS_USED","Return prepaid credits before voiding this invoice");
 const {data,error}=await db.from("invoices").update({status:"void"})
  .eq("id",id).eq("teacher_id",teacherId).eq("status",invoice.status)
  .select("id").maybeSingle();
 if(error)throw fail(500,"DATABASE_ERROR","Unable to void invoice");
 if(!data)throw fail(409,"CONFLICT","Invoice status changed; reload before voiding");
 return {ok:true};
}
export async function teacherInvoiceDraftUpdate(db:Db,teacherId:string,id:string,input:InvoiceDraftEdit){
 const existing=await ownedInvoice(db,teacherId,id);
 if(existing.status!=="draft")throw fail(409,"CONFLICT","Only draft invoices can be edited");
 if(input.notes===undefined&&input.items===undefined)
  throw fail(400,"VALIDATION_ERROR","No invoice changes");
 if(input.notes!==undefined&&(typeof input.notes!=="string"||input.notes.length>2000))
  throw fail(400,"VALIDATION_ERROR","Invoice notes must be at most 2,000 characters");
 const {data:creditPackage,error:cpError}=await db.from("credit_packages").select("id")
  .eq("invoice_id",id).maybeSingle();
 if(cpError)throw fail(500,"DATABASE_ERROR","Prepaid package unavailable");
 if(input.items!==undefined){
  if(!Array.isArray(input.items))throw fail(400,"VALIDATION_ERROR","Invoice items must be an array");
  if(creditPackage)throw fail(409,"CONFLICT","Prepaid-package invoice lines cannot be edited");
  if(input.items.length>100||input.items.some(line=>
    !line.description?.trim()||line.description.length>500||
    ![line.quantity,line.unitCents,line.amountCents].every(Number.isSafeInteger)||
    line.quantity<1||line.quantity>10000||line.unitCents<0||line.amountCents<0))
    throw fail(400,"VALIDATION_ERROR","Invalid invoice line items");
  const lessonIds=[...new Set(input.items.map(x=>x.lessonId).filter((v):v is string=>typeof v==="string"&&v.length>0))];
  if(lessonIds.length){
   const {data:owned,error}=await db.from("lessons").select("id")
    .eq("teacher_id",teacherId).in("id",lessonIds);
   if(error)throw fail(500,"DATABASE_ERROR","Unable to validate invoice lesson references");
   if(owned?.length!==lessonIds.length)throw fail(404,"NOT_FOUND","Referenced lesson belongs to another teacher or does not exist");
  }
  const {data:originalLines,error:linesError}=await db.from("invoice_items")
    .select("id,kind").eq("invoice_id",id);
  if(linesError)throw fail(500,"DATABASE_ERROR","Unable to load invoice lines");
  const kindById=new Map((originalLines??[]).map(row=>[row.id as string,row.kind as string]));
  // Existing website semantics: replace all draft lines; preflight validates the
  // entire request before deletion to reduce partial-write risk.
  const {error:deleteError}=await db.from("invoice_items").delete().eq("invoice_id",id);
  if(deleteError)throw fail(500,"DATABASE_ERROR","Unable to replace invoice lines");
  if(input.items.length){
   const {error:insertError}=await db.from("invoice_items").insert(input.items.map((line,index)=>({
    invoice_id:id,lesson_id:line.lessonId??null,
    kind:line.id&&kindById.get(line.id)==="travel"?"travel":"lesson",
    description:line.description,quantity:line.quantity,unit_cents:line.unitCents,
    amount_cents:line.amountCents,sort_order:index,
   })));
   if(insertError)throw fail(500,"DATABASE_ERROR",
     "Invoice lines could not be saved. Reopen the draft and reconcile before retrying.");
  }
  const subtotal=sumAmountCents(input.items.map(line=>({amountCents:line.amountCents})));
  const {error}=await db.from("invoices").update({
    subtotal_cents:subtotal,...(input.notes!==undefined?{notes:input.notes}:{}),
  }).eq("id",id).eq("teacher_id",teacherId).eq("status","draft");
  if(error)throw fail(500,"DATABASE_ERROR","Invoice subtotal update failed");
 } else {
  const {error}=await db.from("invoices").update({notes:input.notes})
   .eq("id",id).eq("teacher_id",teacherId).eq("status","draft");
  if(error)throw fail(500,"DATABASE_ERROR","Invoice notes update failed");
 }
 return {ok:true};
}
export async function teacherInvoiceSend(db:Db,teacherId:string,id:string,
 teacherEmail:string|undefined,origin:string){
 const result=await sendInvoice(db,{invoiceId:id,teacherId,teacherEmail,origin});
 if(!result.ok)throw fail(result.error==="Not found"?404:409,
  result.error==="Not found"?"NOT_FOUND":"CONFLICT",result.error??"Unable to send invoice");
 return result;
}
