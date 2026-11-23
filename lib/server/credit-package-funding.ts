import type {SupabaseClient} from "@supabase/supabase-js";
import type {InvoiceStatus} from "@/lib/supabase/types";

export type CreditFundingStatus="unavailable"|"not_required"|"none_recorded"|"partial"|"covered";
export type CreditFundingReport={
 invoiceWorkflowStatus:InvoiceStatus|null;
 invoiceCurrency:string|null;
 funding:{status:CreditFundingStatus;recordedInvoicePaymentCents:number|null};
 entitlement:{issued:boolean|null;unredeemedUnits:number;remainingAfterPending:number|null};
};
type OwnedPackage={
 invoiceId:string;invoiceWorkflowStatus:InvoiceStatus|null;invoiceCurrency:string|null;
 priceCents:number;active:boolean;credits:number;usedCredits:number;adjustmentCredits?:number;
 balance?:{remainingCredits:number};
};

/**
 * Invoice-mapped receipts, not all receipts of the billing account. The
 * owner-scoped package/invoice lookup supplies the only invoice IDs read.
 * payments RLS independently checks invoice ownership. Never read payer,
 * method, receipt ID, or an unrelated normalized obligation as funding.
 */
export async function withCreditFundingReport<T extends OwnedPackage>(
 db:SupabaseClient,ownedPackages:readonly T[],
):Promise<Array<T&{fundingReport:CreditFundingReport}>>{
 const invoiceIds=[...new Set(ownedPackages.filter(p=>p.invoiceWorkflowStatus!==null).map(p=>p.invoiceId))];
 const totals=new Map<string,number>();
 const invoiceLimit=100,pageSize=500;
 let complete=true,rowsSeen=0;
 for(let i=0;i<invoiceIds.length&&complete;i+=invoiceLimit){
  const ids=invoiceIds.slice(i,i+invoiceLimit);
  for(let offset=0;;offset+=pageSize){
   const {data,error}=await db.from("payments").select("invoice_id,amount_cents")
    .in("invoice_id",ids).order("id").range(offset,offset+pageSize-1);
   if(error||!data){complete=false;break;}
   rowsSeen+=data.length;
   if(rowsSeen>50_000){complete=false;break;}
   for(const row of data){
    const total=(totals.get(row.invoice_id)??0)+row.amount_cents;
    if(!Number.isSafeInteger(total)){complete=false;break;}
    totals.set(row.invoice_id,total);
   }
   if(!complete||data.length<pageSize)break;
  }
 }
 return ownedPackages.map(p=>{
  const recorded=complete&&p.invoiceWorkflowStatus!==null?(totals.get(p.invoiceId)??0):null;
  const status:CreditFundingStatus=recorded===null?"unavailable":p.priceCents===0?"not_required":
   recorded===0?"none_recorded":recorded<p.priceCents?"partial":"covered";
  return {...p,fundingReport:{
   invoiceWorkflowStatus:p.invoiceWorkflowStatus,invoiceCurrency:p.invoiceCurrency,
   funding:{status,recordedInvoicePaymentCents:recorded},
   // Issued means the existing sent/paid policy allows otherwise eligible
   // lessons. It is not a present eligibility verdict, a funding statement,
   // or permission to spend, refund or transfer these units.
   entitlement:{issued:p.invoiceWorkflowStatus===null?null:p.active,unredeemedUnits:Math.max(0,p.credits+(p.adjustmentCredits??0)-p.usedCredits),
    remainingAfterPending:p.balance?.remainingCredits??null},
  }};
 });
}
