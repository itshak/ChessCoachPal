// These specific, authoritative SQL denials rolled back the attempted write.
// Never clear an exact retry for an unknown error, or a conflicting receipt.
const terminalCheckCodes=[
 "PRIVATE_SERIES_AGREEMENT_NOT_ACTIVE_OR_STALE","PRIVATE_SERIES_EFFECTIVE_TERMS_RETAINED",
 "PRIVATE_SERIES_SCOPE_OR_PROSPECTIVE_DATE_INVALID","AGREEMENT_DATE_MISMATCH",
 "STALE_AGREEMENT_REVISION","PRIVATE_SERIES_AGREEMENT_SOURCE_UNVERIFIED",
 "EXACT_AGREEMENT_REVIEW_REQUIRED","UNCONFIRMED_OR_NO_SHOW_ATTENDANCE",
 "OBLIGATION_AMOUNT_CHANGED_REPREVIEW",
] as const;
const allowedChecks:ReadonlySet<string>=new Set(terminalCheckCodes);
const typedTerminal:ReadonlySet<string>=new Set([
 ...terminalCheckCodes,"PRIVATE_SERIES_TERMS_OVERLAP","PRIVATE_SERIES_PAYER_UNAVAILABLE",
 "PRIVATE_SERIES_EARNING_ALREADY_POSTED",
]);
export function isPrivateSeriesTerminalDenial(code:string){return typedTerminal.has(code);}
export function privateSeriesTerminalCode(error:{code?:string;message:string}):string|undefined{
 const {code,message}=error;
 if(code==="23514"&&allowedChecks.has(message))return message;
 if(code==="23505"&&message==="OVERLAPPING_COMPENSATION_AGREEMENT")return "PRIVATE_SERIES_TERMS_OVERLAP";
 if(code==="42501"&&message==="BILLING_ACCOUNT_NOT_ACTIVE_OR_OWNED")return "PRIVATE_SERIES_PAYER_UNAVAILABLE";
 // PostgreSQL may report either the exact agreement/source uniqueness or
 // the stricter one-coach-earning index for the same attempted occurrence.
 if(code==="23505"&&[
  'duplicate key value violates unique constraint "financial_obligations_one_coach_occurrence"',
  'duplicate key value violates unique constraint "financial_obligations_teacher_id_agreement_id_source_key_key"',
 ].includes(message))
  return "PRIVATE_SERIES_EARNING_ALREADY_POSTED";
}
