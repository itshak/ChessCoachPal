import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {FinanceLedgerError} from "./finance-ledger-service";

const monthStart=z.iso.date().refine(value=>value>="0001-01-01"&&value.endsWith("-01"));
const uuid=z.string().uuid();
const currency=z.string().regex(/^[A-Z]{3}$/);
const scopeSchema=z.object({
 workplaceId:uuid,monthStart,currency,billingAccountId:uuid.nullable().default(null),
}).strict();
export const financePeriodEndActualsSchema=scopeSchema;
const cents=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const subtotal=z.object({
 obligationCount:cents,grossPostedCents:cents,correctionCents:cents,correctedPostedCents:cents,
 netAppliedCents:cents,outstandingCents:cents,
}).strict();
const category=<T extends string>(kind:T)=>subtotal.extend({kind:z.literal(kind)}).refine(
 row=>row.grossPostedCents-row.correctionCents===row.correctedPostedCents
   &&row.correctedPostedCents-row.netAppliedCents===row.outstandingCents
   &&(row.obligationCount>0||row.grossPostedCents===0),
);
const resultSchema=scopeSchema.extend({
 monthEnd:z.iso.date(),settlementBasis:z.literal("current"),
 categories:z.tuple([category("coach_earning"),category("period_compensation"),category("participant_charge")]),
});
export type FinancePeriodEndActuals=z.infer<typeof resultSchema>;

function unavailable(){
 return new FinanceLedgerError(503,"PERIOD_END_ACTUALS_UNAVAILABLE","The posted monthly settlement is unavailable");
}

export async function financePeriodEndActuals(db:SupabaseClient,input:z.input<typeof scopeSchema>){
 const parsed=scopeSchema.parse(input);
 const scope={...parsed,workplaceId:parsed.workplaceId.toLowerCase(),
  billingAccountId:parsed.billingAccountId?.toLowerCase()??null};
 const {data,error}=await db.rpc("ccp_finance_period_end_actuals",{
  p_workplace_id:scope.workplaceId,p_month_start:scope.monthStart,p_currency:scope.currency,
  p_billing_account_id:scope.billingAccountId,
 });
 if(error?.code==="42501")
  throw new FinanceLedgerError(403,"PERIOD_END_ACTUALS_SCOPE_NOT_OWNED","This settlement report is unavailable for the requested scope");
 if(error?.code==="22023")
  throw new FinanceLedgerError(400,"INVALID_PERIOD_END_ACTUALS_SCOPE","Invalid monthly settlement filters");
 if(error)throw unavailable();
 const checked=resultSchema.safeParse(data);
 const end=new Date(`${scope.monthStart}T00:00:00.000Z`);
 end.setUTCMonth(end.getUTCMonth()+1,0);
 if(!checked.success||checked.data.workplaceId!==scope.workplaceId
   ||checked.data.monthStart!==scope.monthStart||checked.data.monthEnd!==end.toISOString().slice(0,10)
   ||checked.data.currency!==scope.currency||checked.data.billingAccountId!==scope.billingAccountId)
  throw unavailable();
 return checked.data;
}
