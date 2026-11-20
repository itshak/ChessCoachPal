import type {SupabaseClient} from "@supabase/supabase-js";
import {isAppLocale,type AppLocale} from "@/i18n/locales";
import {oneToOne} from "@/lib/schedule";

/** Explicit payer contact is not automatically entitled to a student's
 * personal information. Sending an invoice requires current teacher-attested
 * permission to receive messages for EVERY student appearing on its lines.
 * This does not issue a portal grant, login, or access to other workplaces.
 */
export interface InvoiceBillingContact {
  id:string;display_name:string;account_kind:string;contact_id:string|null;
  contacts:{id:string;display_name:string;email:string|null;
    preferred_locale:string|null;status:string}|
    {id:string;display_name:string;email:string|null;
      preferred_locale:string|null;status:string}[]|null;
}
export type ApprovedInvoiceRecipient={
  email:string;displayName:string;locale:AppLocale;
};
export async function approvedInvoiceRecipient(
  db:SupabaseClient,teacherId:string,invoiceId:string,account:InvoiceBillingContact
):Promise<ApprovedInvoiceRecipient|null>{
  const contact=oneToOne(account.contacts);
  if(!contact||contact.id!==account.contact_id||contact.status!=="active"||
    !contact.email?.trim())return null;
  const [lines,packages]=await Promise.all([
    db.from("invoice_items").select("kind,student_id")
      .eq("invoice_id",invoiceId).order("id"),
    db.from("credit_packages").select("student_id")
      .eq("teacher_id",teacherId).eq("invoice_id",invoiceId),
  ]);
  if(lines.error||packages.error)throw new Error("Invoice recipient source unavailable");
  const items=lines.data??[];
  const pkg=packages.data??[];
  if(!items.length)return null;
  const students=new Set<string>();
  for(const item of items){
    if(item.kind==="credit_package"){
      if(pkg.length!==1||!pkg[0].student_id)return null;
      students.add(pkg[0].student_id);
    }else if(item.student_id){
      students.add(item.student_id);
    }else return null;
  }
  const today=new Date().toISOString().slice(0,10);
  const {data:links,error}=await db.from("student_contacts")
    .select("student_id,active_from,active_to,may_receive_messages")
    .eq("teacher_id",teacherId).eq("contact_id",contact.id)
    .eq("may_receive_messages",true).in("student_id",[...students]);
  if(error)throw new Error("Invoice contact permission verification unavailable");
  const permitted=new Set((links??[]).filter(link=>
    (!link.active_from||link.active_from<=today)&&
    (!link.active_to||link.active_to>=today)).map(link=>link.student_id));
  if([...students].some(id=>!permitted.has(id)))return null;
  return {email:contact.email.trim(),displayName:contact.display_name,
    locale:isAppLocale(contact.preferred_locale)?contact.preferred_locale:"en"};
}
