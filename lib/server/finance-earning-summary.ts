import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {FinanceLedgerError} from "./finance-ledger-service";

const uuid=z.string().uuid();
const date=z.iso.date().refine(value=>value>="0001-01-01");
const currency=z.string().regex(/^[A-Z]{3}$/);
export const financeEarningSummarySchema=z.object({
 workplaceId:uuid,from:date,to:date,currency,billingAccountId:uuid.nullable().default(null),
}).strict().refine(x=>x.from<=x.to&&Date.parse(x.to)-Date.parse(x.from)<=365*86400000,
 "Choose a valid inclusive period of no more than 366 days");
const cents=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const resultSchema=z.object({
 workplaceId:z.string().uuid(),from:date,to:date,currency,billingAccountId:z.string().uuid().nullable(),
 obligationCount:cents,grossPostedCents:cents,correctionCents:cents,correctedPostedCents:cents,
 netAllocatedReceivedCents:cents,outstandingCents:cents,
}).strict().refine(x=>x.grossPostedCents-x.correctionCents===x.correctedPostedCents
 &&x.correctedPostedCents-x.netAllocatedReceivedCents===x.outstandingCents
 &&(x.obligationCount>0||x.grossPostedCents===0));
export type FinanceEarningSummary=z.infer<typeof resultSchema>;

export async function financeEarningSummary(db:SupabaseClient,input:z.input<typeof financeEarningSummarySchema>){
 const parsed=financeEarningSummarySchema.parse(input);
 const scope={...parsed,workplaceId:parsed.workplaceId.toLowerCase(),
  billingAccountId:parsed.billingAccountId?.toLowerCase()??null};
 const {data,error}=await db.rpc("ccp_finance_earning_summary",{
  p_workplace_id:scope.workplaceId,p_from:scope.from,p_to:scope.to,p_currency:scope.currency,
  p_billing_account_id:scope.billingAccountId,
 });
 if(error?.code==="42501")
  throw new FinanceLedgerError(403,"EARNINGS_SUMMARY_SCOPE_NOT_OWNED","This earnings report is unavailable for the requested scope");
 if(error?.code==="22023")
  throw new FinanceLedgerError(400,"INVALID_EARNINGS_SUMMARY_SCOPE","Invalid earnings report filters");
 if(error)throw new FinanceLedgerError(503,"EARNINGS_SUMMARY_UNAVAILABLE","The posted earnings summary is unavailable");
 const candidate=resultSchema.safeParse(data);
 if(!candidate.success||candidate.data.workplaceId!==scope.workplaceId
  ||candidate.data.from!==scope.from||candidate.data.to!==scope.to
  ||candidate.data.currency!==scope.currency||candidate.data.billingAccountId!==scope.billingAccountId)
  throw new FinanceLedgerError(503,"EARNINGS_SUMMARY_UNAVAILABLE","The posted earnings summary is unavailable");
 return candidate.data;
}
