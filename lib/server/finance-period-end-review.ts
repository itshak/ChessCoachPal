import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {financePeriodEndActualsSchema} from "./finance-period-end-actuals";
import {FinanceLedgerError} from "./finance-ledger-service";

export const financePeriodEndReviewSchema=financePeriodEndActualsSchema;
const LIMIT=120;
const agreementSchema=z.object({id:z.uuid(),billing_account_id:z.uuid(),
 revision:z.number().int().positive(),rate_cents:z.number().int().positive().max(1_000_000_000)});
const payerSchema=z.object({id:z.uuid(),status:z.enum(["active","archived"])});
const postedSchema=z.object({agreement_id:z.uuid()});

const unavailable=()=>new FinanceLedgerError(503,"PERIOD_END_REVIEW_UNAVAILABLE",
 "The complete fixed-period review is unavailable for the requested scope");
const denied=()=>new FinanceLedgerError(403,"PERIOD_END_REVIEW_SCOPE_NOT_OWNED",
 "This review is unavailable for the requested scope");
function complete<T>(schema:z.ZodType<T>,result:{data:unknown;count:number|null;error:unknown},limit:number):T[]{
 const checked=z.array(schema).safeParse(result.data);
 if(result.error||!checked.success||result.count!==checked.data.length||checked.data.length>limit)throw unavailable();
 return checked.data;
}

/** Advisory discovery only. These bounded reads do not share a SQL snapshot.
 * The write path still validates ownership, terms, revision and uniqueness.
 * Session-based earnings and participant charges are not inferred here. */
export async function financePeriodEndReview(db:SupabaseClient,teacherId:string,
 input:z.input<typeof financePeriodEndReviewSchema>){
 const checked=financePeriodEndReviewSchema.parse(input);
 const scope={...checked,workplaceId:checked.workplaceId.toLowerCase(),
  billingAccountId:checked.billingAccountId?.toLowerCase()??null};
 const end=new Date(scope.monthStart+"T00:00:00.000Z");
 end.setUTCMonth(end.getUTCMonth()+1,0);
 const monthEnd=end.toISOString().slice(0,10);
 const [venue,payer]=await Promise.all([
  db.from("workplaces").select("id").eq("teacher_id",teacherId).eq("id",scope.workplaceId).maybeSingle(),
  scope.billingAccountId?db.from("billing_accounts").select("id")
   .eq("teacher_id",teacherId).eq("id",scope.billingAccountId).maybeSingle():null,
 ]);
 if(venue.error||payer?.error)throw unavailable();
 if(!venue.data||(payer&&!payer.data))throw denied();
 let query=db.from("compensation_agreements").select("id,billing_account_id,revision,rate_cents",{count:"exact"})
  .eq("teacher_id",teacherId).eq("workplace_id",scope.workplaceId).eq("currency",scope.currency)
  .eq("status","active").eq("agreement_role","coach_earning").eq("model","fixed_period")
  .is("private_series_id",null).is("exact_session_id",null).gt("rate_cents",0)
  .lte("effective_from",scope.monthStart).or(`effective_to.is.null,effective_to.gte.${monthEnd}`);
 if(scope.billingAccountId)query=query.eq("billing_account_id",scope.billingAccountId);
 const agreements=complete(agreementSchema,await query.order("id").limit(LIMIT+1),LIMIT);
 const agreementIds=agreements.map(row=>row.id);
 const payerIds=[...new Set(agreements.map(row=>row.billing_account_id))];
 if(new Set(agreementIds).size!==agreementIds.length)throw unavailable();
 const [accounts,posted]=agreements.length?await Promise.all([
  db.from("billing_accounts").select("id,status",{count:"exact"}).eq("teacher_id",teacherId)
   .in("id",payerIds).order("id").limit(LIMIT+1),
  db.from("financial_obligations").select("agreement_id",{count:"exact"}).eq("teacher_id",teacherId)
   .eq("workplace_id",scope.workplaceId).eq("kind","period_compensation")
   .eq("period_start",scope.monthStart).eq("period_end",monthEnd)
   .in("agreement_id",agreementIds).order("agreement_id").limit(LIMIT+1),
 ]):[{data:[],count:0,error:null},{data:[],count:0,error:null}];
 const payerById=new Map(complete(payerSchema,accounts,LIMIT).map(row=>[row.id,row.status]));
 const postedIds=new Set(complete(postedSchema,posted,LIMIT).map(row=>row.agreement_id));
 if(payerById.size!==payerIds.length||payerIds.some(id=>!payerById.has(id)))throw unavailable();
 return {...scope,monthEnd,reviewBasis:"fixed_period_only" as const,approvalRequired:true as const,
  snapshot:"advisory" as const,items:agreements.filter(row=>!postedIds.has(row.id)).map(row=>({
   agreementId:row.id,billingAccountId:row.billing_account_id,revision:row.revision,
   proposedCents:row.rate_cents,reviewStatus:payerById.get(row.billing_account_id)==="active"?
    "review_required" as const:"payer_archived" as const,
  }))};
}
export type FinancePeriodEndReview=Awaited<ReturnType<typeof financePeriodEndReview>>;
