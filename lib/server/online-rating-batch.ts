import "server-only";
import {z} from "zod";
import type {runOnlineRatingLease} from "./online-rating-worker";
import {provider} from "../chess-public-ratings";

const candidate=z.object({teacherId:z.uuid(),jobId:z.uuid(),provider}).strict();
type Candidate=z.infer<typeof candidate>;
type Provider=Candidate["provider"];
type Dependencies={
 enabled:()=>boolean;
 /**
  * Operator explicitly supplies a distributed, per-provider reservation before
  * claim. An unusable/stale candidate may consume a reservation; this is
  * intentionally conservative rather than allowing unbudgeted requests.
  */
 reserve:(provider:Provider)=>Promise<boolean>;
 discover:(provider:Provider,limit:number)=>Promise<unknown>;
 // The assembled lease adapter enforces this exact provider again before egress.
 run:(ids:Pick<Candidate,"teacherId"|"jobId">,budgetedProvider:Provider)=>ReturnType<typeof runOnlineRatingLease>;
};
const batchLimits=z.object({
 lichess:z.number().int().min(0).max(2),
 chesscom:z.number().int().min(0).max(2),
}).strict();

/** No caller, transport, config, provider credentials or real rate policy.
 * Worker trust is constrained by the supplied authority and lease checks. */
export async function runOnlineRatingBatch(limits:unknown,deps:Dependencies){
 const counters={scanned:0,submitted:0,finalized:0,withheld:0,unavailable:0};
 const result=(status:"disabled"|"ran"|"invalid")=>({status,...counters});
 const active=()=>{try{return deps.enabled()===true;}catch{return false;}};
 if(!active())return result("disabled");
 const parsed=batchLimits.safeParse(limits);
 if(!parsed.success)return result("invalid");
 const seen=new Set<string>();
 for(const key of provider.options){
  if(!active())return result("disabled");
  const size=parsed.data[key];
  if(size===0)continue;
  let rows:unknown;
  try{rows=await deps.discover(key,size);}
  catch{counters.unavailable++;continue;}
  if(!active())return result("disabled");
  const selected=z.array(candidate).max(size).safeParse(rows);
  if(!selected.success||selected.data.some(row=>row.provider!==key)){
   counters.unavailable++;continue;
  }
  counters.scanned+=selected.data.length;
  for(const row of selected.data){
   if(!active())return result("disabled");
   const identity=row.teacherId+":"+row.jobId;
   if(seen.has(identity))continue;
   seen.add(identity);
   let reserved:boolean;
   try{reserved=await deps.reserve(key);}
   catch{counters.unavailable++;break;}
   if(!active())return result("disabled");
   if(reserved!==true){counters.withheld++;break;}
   counters.submitted++;
   try{
    const processed=await deps.run({teacherId:row.teacherId,jobId:row.jobId},key);
    if(processed.status==="finalized")counters.finalized++;
    else if(processed.status==="authority_unavailable"||processed.status==="finalization_unavailable")
     counters.unavailable++;
   }catch{counters.unavailable++;}
  }
 }
 return result(active()?"ran":"disabled");
}
