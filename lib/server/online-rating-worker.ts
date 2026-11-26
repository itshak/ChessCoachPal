import "server-only";
import {createHash} from "node:crypto";
import {z} from "zod";
import {parseChesscomStats,parseLichessPerfs,provider,timeControl} from "../chess-public-ratings";
import {StudentRatingError} from "./online-rating-transport";

const candidateShape=z.object({teacherId:z.uuid(),jobId:z.uuid()}).strict();
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const leaseShape=candidateShape.extend({
 studentId:z.uuid(),provider,sourceUsername:z.string().regex(/^[A-Za-z0-9_-]{2,30}$/),
 handleRevision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),inputDigest:digest,
 triggerKind:z.enum(["profile_save","manual","scheduled","history_backfill"]),
 attempt:z.number().int().min(1).max(30),leaseToken:z.uuid(),leaseUntil:z.iso.datetime({offset:true}),
}).strict();
const receiptShape=z.object({
 status:z.enum(["succeeded","stale","retry","failed","cancelled"]),
 snapshotsWritten:z.number().int().min(0).max(20),
});
type Candidate=z.infer<typeof candidateShape>;
type Lease=z.infer<typeof leaseShape>;
type Observation={
 time_control:z.infer<typeof timeControl>;rating:number;
 rating_deviation:number|null;provisional:boolean|null;games:number|null;observed_at:string;
};
type Attempt={
 p_teacher_id:string;p_job_id:string;p_lease_token:string;p_attempt:number;p_input_digest:string;
} & (
 {p_outcome:"succeeded";p_fetched_at:string;p_evidence_digest:string;p_observations:Observation[];p_error_code:null}
 | {p_outcome:"retry"|"failed";p_fetched_at:null;p_evidence_digest:null;p_observations:[];p_error_code:string}
);
type Dependencies={
 // There is deliberately no env/config lookup or default transport/caller.
 enabled?:()=>boolean;
 claim:(ids:Candidate)=>Promise<unknown>;
 // Must freshly recheck this exact live lease, active student, registered
 // provider, matching saved handle and valid durable opt-in before any egress.
 admit:(lease:Readonly<Lease>)=>Promise<boolean>;
 transport:(provider:Lease["provider"],username:string)=>Promise<unknown>;
 finalize:(attempt:Attempt)=>Promise<unknown>;
 now?:()=>number;
};

/** Shared provider authority could not safely settle the exact reservation.
 * Never finalize a provider outcome from this attempt. */
export class OnlineRatingBudgetUnavailable extends Error {
 constructor(){super("Online rating provider budget unavailable");}
}

type ProviderFailure={outcome:"retry"|"failed";code:
 "RATE_LIMITED"|"ACCOUNT_NOT_FOUND"|"PROVIDER_DENIED"|"PROVIDER_RESPONSE"|"PROVIDER_UNAVAILABLE"|"RATING_UNAVAILABLE"};
function providerFailure(error:unknown):ProviderFailure{
 const code=error instanceof StudentRatingError?error.code:"PROVIDER_UNAVAILABLE";
 switch(code){
  case "RATE_LIMITED":return {outcome:"retry",code} as const;
  case "ACCOUNT_NOT_FOUND":
  case "PROVIDER_DENIED":
  case "PROVIDER_RESPONSE":return {outcome:"failed",code} as const;
  default:return {outcome:"retry",code:"PROVIDER_UNAVAILABLE"} as const;
 }
}

function observations(lease:Lease,payload:unknown,fetchedAt:string):Observation[]{
 const parsed=lease.provider==="lichess"?parseLichessPerfs(payload,fetchedAt):
  parseChesscomStats(payload,fetchedAt);
 const seen=new Set<string>();
 return parsed.map(row=>{
  if(row.rating===null||row.observedAt>fetchedAt||seen.has(row.timeControl))
   throw new Error("Invalid normalized provider evidence");
  seen.add(row.timeControl);
  return {time_control:row.timeControl,rating:row.rating,rating_deviation:row.ratingDeviation,
   provisional:row.provisional,games:row.games!==null&&row.games<=10_000_000?row.games:null,
   observed_at:row.observedAt};
 });
}

/** Unwired single-attempt service. Canonical claim/finalize own authorization
 * and durability; an application recheck is not an atomic network barrier. */
export async function runOnlineRatingLease(candidate:Candidate,deps:Dependencies){
 const enabled=()=>{try{return deps.enabled?.()===true;}catch{return false;}};
 const now=deps.now??Date.now;
 const beforeExpiry=(until:number)=>{
  const at=now();
  return Number.isSafeInteger(at)&&at>=0&&at<until?at:null;
 };
 if(!enabled())return {status:"disabled"} as const;
 const ids=candidateShape.safeParse(candidate);
 if(!ids.success)return {status:"not_admitted"} as const;
 Object.freeze(ids.data);
 let raw:unknown;
 try{raw=await deps.claim(ids.data);}catch{return {status:"authority_unavailable"} as const;}
 const checked=leaseShape.safeParse(raw);
 if(!checked.success||checked.data.teacherId!==ids.data.teacherId||checked.data.jobId!==ids.data.jobId||
  checked.data.triggerKind==="history_backfill")
  return {status:"not_admitted"} as const;
 const lease=checked.data,until=Date.parse(lease.leaseUntil);
 if(!enabled())return {status:"disabled"} as const;
 if(beforeExpiry(until)===null)return {status:"not_admitted"} as const;
 let admitted:boolean;
 try{admitted=await deps.admit(Object.freeze(lease));}catch{return {status:"authority_unavailable"} as const;}
 if(!enabled())return {status:"disabled"} as const;
 if(admitted!==true||beforeExpiry(until)===null)return {status:"not_admitted"} as const;
 let payload:unknown,failure:ProviderFailure|undefined;
 try{payload=await deps.transport(lease.provider,lease.sourceUsername);}catch(error){
  if(error instanceof OnlineRatingBudgetUnavailable)return {status:"authority_unavailable"} as const;
  failure=providerFailure(error);
 }
 if(!enabled())return {status:"disabled"} as const;
 const fetched=beforeExpiry(until);
 if(fetched===null)return {status:"not_admitted"} as const;
 const fetchedAt=new Date(fetched).toISOString();
 let rows:Observation[]=[];
 if(!failure){
  try{
   rows=observations(lease,payload,fetchedAt);
   if(rows.length===0)failure={outcome:"failed",code:"RATING_UNAVAILABLE"};
  }catch{failure={outcome:"failed",code:"PROVIDER_RESPONSE"};}
 }
 const key={p_teacher_id:lease.teacherId,p_job_id:lease.jobId,p_lease_token:lease.leaseToken,
  p_attempt:lease.attempt,p_input_digest:lease.inputDigest};
 const attempt:Attempt=failure?{...key,p_outcome:failure.outcome,
  p_fetched_at:null,p_evidence_digest:null,p_observations:[],p_error_code:failure.code}:
  {...key,p_outcome:"succeeded",p_fetched_at:fetchedAt,p_observations:rows,p_error_code:null,
   p_evidence_digest:createHash("sha256").update(JSON.stringify(["online-rating-worker-v1",lease.provider,rows])).digest("hex")};
 let result:unknown;
 try{result=await deps.finalize(attempt);}catch{return {status:"finalization_unavailable"} as const;}
 if(result===null)return {status:"not_admitted"} as const;
 const receipt=receiptShape.safeParse(result);
 return receipt.success?{status:"finalized",outcome:receipt.data.status,snapshotsWritten:receipt.data.snapshotsWritten} as const:
  {status:"finalization_unavailable"} as const;
}
