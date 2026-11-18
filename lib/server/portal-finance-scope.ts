import type {SupabaseClient} from "@supabase/supabase-js";
import type {PortalContext} from "./portal-scope-service";
import {portalGrantAllows} from "./portal-grants-service";

export type ScopedInvoice={
  id:string;periodStart:string;periodEnd:string;status:"sent"|"paid";
  subtotalCents:number;currency:string;paidCents:number;checkoutUrl:string|null;
};
type Db=SupabaseClient;
type Invoice={id:string;period_start:string;period_end:string;
  status:"sent"|"paid";subtotal_cents:number;currency:string;
  stripe_checkout_url:string|null;billing_account_id:string};
type Item={invoice_id:string;session_id:string|null;student_id:string|null};
/**
 * An invoice can contain multiple student/workplace charges. NEVER reveal its
 * total or checkout URL merely because the contact owns its payer: the entire
 * invoice must contain only charges for this grant's exact learner/workplace.
 * An unattributed item makes the whole invoice private until corrected.
 */
export async function portalScopedInvoices(db:Db,ctx:PortalContext):Promise<ScopedInvoice[]>{
  const {grant}=ctx;
  if(!grant.permissions.has("finance")||!grant.billingAccountId)return [];
  const {data,error}=await db.from("invoices")
    .select("id,period_start,period_end,status,subtotal_cents,currency,stripe_checkout_url,billing_account_id")
    .eq("teacher_id",grant.teacherId).eq("billing_account_id",grant.billingAccountId)
    .in("status",["sent","paid"]).not("sent_at","is",null)
    .order("period_end",{ascending:false}).limit(100);
  if(error)throw new Error("Scoped invoices are temporarily unavailable");
  const invoices=(data??[]) as Invoice[];
  if(!invoices.length)return [];
  const ids=invoices.map(row=>row.id);
  const {data:items,error:itemError}=await db.from("invoice_items")
    .select("invoice_id,session_id,student_id").in("invoice_id",ids);
  if(itemError)throw new Error("Scoped invoice items unavailable");
  const all=(items??[]) as Item[];
  const sessionIds=[...new Set(all.flatMap(item=>item.session_id?[item.session_id]:[]))];
  const workplaceBySession=new Map<string,string>();
  for(let i=0;i<sessionIds.length;i+=100){
    const {data:sessions,error:sessionError}=await db.from("teaching_sessions")
      .select("id,workplace_id").eq("teacher_id",grant.teacherId)
      .in("id",sessionIds.slice(i,i+100));
    if(sessionError)throw new Error("Cannot verify invoice workplace attribution");
    for(const row of sessions??[])workplaceBySession.set(row.id,row.workplace_id);
  }
  const byInvoice=new Map<string,Item[]>();
  for(const item of all){
    const list=byInvoice.get(item.invoice_id)??[];
    list.push(item);byInvoice.set(item.invoice_id,list);
  }
  const verified=invoices.filter(row=>{
    if(!portalGrantAllows(grant,"finance",{
      teacherId:grant.teacherId,studentId:grant.studentId,
      workplaceId:grant.workplaceId,billingAccountId:row.billing_account_id}))return false;
    const lines=byInvoice.get(row.id)??[];
    return lines.length>0&&lines.every(item=>item.student_id===grant.studentId&&
      item.session_id!==null&&workplaceBySession.get(item.session_id)===grant.workplaceId);
  });
  if(!verified.length)return [];
  const {data:payments,error:paymentError}=await db.from("payments")
    .select("invoice_id,amount_cents").in("invoice_id",verified.map(x=>x.id));
  if(paymentError)throw new Error("Scoped payment summary unavailable");
  const paid=new Map<string,number>();
  for(const row of payments??[])paid.set(row.invoice_id,(paid.get(row.invoice_id)??0)+row.amount_cents);
  return verified.slice(0,12).map(row=>({
    id:row.id,periodStart:row.period_start,periodEnd:row.period_end,
    status:row.status,subtotalCents:row.subtotal_cents,currency:row.currency,
    paidCents:paid.get(row.id)??0,checkoutUrl:row.stripe_checkout_url,
  }));
}
