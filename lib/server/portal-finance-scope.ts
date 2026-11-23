import type {SupabaseClient} from "@supabase/supabase-js";
import type {PortalContext} from "./portal-scope-service";
import {portalGrantAllows} from "./portal-grants-service";

export type ScopedInvoice={
  id:string;periodStart:string;periodEnd:string;status:"sent"|"paid";
  kind:"lesson_invoice"|"prepaid_purchase";
  subtotalCents:number;currency:string;paidCents:number;checkoutUrl:string|null;
};
type Db=SupabaseClient;
type Invoice={id:string;period_start:string;period_end:string;
  status:"sent"|"paid";subtotal_cents:number;currency:string;
  stripe_checkout_url:string|null;billing_account_id:string};
type Item={invoice_id:string;session_id:string|null;student_id:string|null;
  kind:string;quantity:number;unit_cents:number;amount_cents:number};
type Purchase={invoice_id:string;student_id:string;workplace_id:string;price_cents:number};
type Payment={invoice_id:string;amount_cents:number};
const INVOICE_BATCH=20;
const EVIDENCE_LIMIT=1000;

function chunks<T>(values:T[],size:number){
  return Array.from({length:Math.ceil(values.length/size)},(_,i)=>values.slice(i*size,(i+1)*size));
}

/** Never use a PostgREST subset to prove every line or sum receipts. The exact
 * count and page are obtained in the same request; avoid mixing evidence for
 * one invoice across mutable offset pages. Treat incomplete metadata as denial. */
export function completePortalFinanceRows<T>(
  data:T[]|null,count:number|null,
):T[]|null{
  return data!==null&&count!==null&&count<=EVIDENCE_LIMIT&&data.length===count?data:null;
}
/** A canonical prepaid sale has exactly one bare purchase line and one
 * invoice-linked package. The package is evidence only, never a guest DTO. */
export function verifiedPortalPurchase(subtotal:number,lines:Item[],purchase:Purchase|undefined){
  if(!purchase||lines.length!==1)return false;
  const line=lines[0]!;
  return line.kind==="credit_package"&&line.session_id===null&&line.student_id===null&&
    line.quantity===1&&line.unit_cents===subtotal&&line.amount_cents===subtotal&&
    purchase.price_cents===subtotal;
}
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
    .order("period_end",{ascending:false}).order("id").limit(100);
  if(error)throw new Error("Scoped invoices are temporarily unavailable");
  const invoices=(data??[]) as Invoice[];
  if(!invoices.length)return [];
  const all:Item[]=[];
  const purchaseByInvoice=new Map<string,Purchase>();
  for(const ids of chunks(invoices.map(row=>row.id),INVOICE_BATCH)){
    const {data,count,error:itemsError}=await db.from("invoice_items")
      .select("invoice_id,session_id,student_id,kind,quantity,unit_cents,amount_cents",{count:"exact"}).in("invoice_id",ids)
      .order("id").limit(EVIDENCE_LIMIT);
    if(itemsError)throw new Error("Scoped invoice items unavailable");
    const complete=completePortalFinanceRows((data??null) as Item[]|null,count);
    if(!complete)return [];
    all.push(...complete);
    const packages=await db.from("credit_packages")
      .select("invoice_id,student_id,workplace_id,price_cents",{count:"exact"})
      .eq("teacher_id",grant.teacherId).in("invoice_id",ids).order("invoice_id").limit(INVOICE_BATCH);
    if(packages.error)throw new Error("Scoped purchase evidence unavailable");
    const completePurchases=completePortalFinanceRows((packages.data??null) as Purchase[]|null,packages.count);
    if(!completePurchases)return [];
    for(const purchase of completePurchases){
      if(purchaseByInvoice.has(purchase.invoice_id))return [];
      purchaseByInvoice.set(purchase.invoice_id,purchase);
    }
  }
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
  const verified=invoices.flatMap((row):Array<{row:Invoice;kind:ScopedInvoice["kind"]}>=>{
    const lines=byInvoice.get(row.id)??[];
    const purchase=purchaseByInvoice.get(row.id);
    if(purchase||lines.some(line=>line.kind==="credit_package")){
      if(!verifiedPortalPurchase(row.subtotal_cents,lines,purchase)||!purchase||
        !portalGrantAllows(grant,"finance",{teacherId:grant.teacherId,
          studentId:purchase.student_id,workplaceId:purchase.workplace_id,
          billingAccountId:row.billing_account_id}))return [];
      return [{row,kind:"prepaid_purchase"}];
    }
    if(!portalGrantAllows(grant,"finance",{
      teacherId:grant.teacherId,studentId:grant.studentId,
      workplaceId:grant.workplaceId,billingAccountId:row.billing_account_id})||
      !lines.length||!lines.every(item=>item.student_id===grant.studentId&&
        item.session_id!==null&&workplaceBySession.get(item.session_id)===grant.workplaceId))return [];
    return [{row,kind:"lesson_invoice"}];
  });
  if(!verified.length)return [];
  const paid=new Map<string,number>();
  for(const ids of chunks(verified.slice(0,12).map(({row})=>row.id),INVOICE_BATCH)){
    const {data,count,error:paymentError}=await db.from("payments")
      .select("invoice_id,amount_cents",{count:"exact"}).in("invoice_id",ids)
      .order("id").limit(EVIDENCE_LIMIT);
    if(paymentError)throw new Error("Scoped payment summary unavailable");
    const complete=completePortalFinanceRows((data??null) as Payment[]|null,count);
    if(!complete)return [];
    for(const row of complete)paid.set(row.invoice_id,(paid.get(row.invoice_id)??0)+row.amount_cents);
  }
  return verified.slice(0,12).map(({row,kind})=>({
    kind,
    id:row.id,periodStart:row.period_start,periodEnd:row.period_end,
    status:row.status,subtotalCents:row.subtotal_cents,currency:row.currency,
    paidCents:paid.get(row.id)??0,checkoutUrl:kind==="lesson_invoice"?row.stripe_checkout_url:null,
  }));
}
