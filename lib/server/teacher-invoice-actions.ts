import type { SupabaseClient } from "@supabase/supabase-js";
import { sendInvoice } from "@/lib/server/invoice-send";
export class InvoiceActionError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,msg:string)=>new InvoiceActionError(status,code,msg);
type Db=SupabaseClient;
type InvoiceLine={id?:string;lessonId?:string|null;description:string;quantity:number;
 unitCents:number;amountCents:number};
export type InvoiceDraftEdit={notes?:string;items?:InvoiceLine[];expectedUpdatedAt?:string};
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
  void teacherId; // SQL independently enforces auth.uid() ownership.
  if(input.notes===undefined&&input.items===undefined)
    throw fail(400,"VALIDATION_ERROR","No invoice changes");
  if(input.notes!==undefined&&(typeof input.notes!=="string"||input.notes.length>2000))
    throw fail(400,"VALIDATION_ERROR","Invoice notes must be at most 2,000 characters");
  if(input.items!==undefined){
    if(!Array.isArray(input.items)||input.items.length>100||input.items.some(line=>
      !line.description?.trim()||line.description.length>500||
      ![line.quantity,line.unitCents,line.amountCents].every(Number.isSafeInteger)||
      line.quantity<1||line.quantity>10000||
      line.unitCents<0||line.unitCents>100000000||
      line.amountCents<0||line.amountCents>100000000))
      throw fail(400,"VALIDATION_ERROR","Invalid invoice line items");
  }
  const {data,error}=await db.rpc("ccp_invoice_draft_update",{
    p_invoice_id:id,p_notes:input.notes??null,p_items:input.items??null,
    p_expected_updated_at:input.expectedUpdatedAt??null,
  });
  if(error){
    if(error.message.includes("NOT_FOUND"))
      throw fail(404,"NOT_FOUND","Invoice or referenced lesson not found");
    if(/INVOICE_NOT_DRAFT|PREPAID_INVOICE_IMMUTABLE|STALE_INVOICE_REVISION/.test(error.message))
      throw fail(409,"CONFLICT","Invoice state changed or prepaid lines cannot be edited");
    if(/INVALID|EMPTY|OVERFLOW/.test(error.message))
      throw fail(400,"VALIDATION_ERROR","Invalid draft invoice line items or notes");
    throw fail(500,"DATABASE_ERROR","Draft invoice was not changed");
  }
  return data as {ok:true};
}
export async function teacherInvoiceSend(db:Db,teacherId:string,id:string,
 teacherEmail:string|undefined,origin:string){
 const result=await sendInvoice(db,{invoiceId:id,teacherId,teacherEmail,origin});
 if(!result.ok)throw fail(result.error==="Not found"?404:409,
  result.error==="Not found"?"NOT_FOUND":"CONFLICT",result.error??"Unable to send invoice");
 return result;
}
