import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {provider} from "../chess-public-ratings";

const supportedTriggers=["profile_save","manual","scheduled"] as const;
const when=z.iso.datetime({offset:true});
const common={id:z.uuid(),teacher_id:z.uuid()};
const dueRow=z.object({...common,run_after:when}).strict();
const expiredRow=z.object({...common,lease_until:when}).strict();
const selection=z.object({provider,limit:z.number().int().min(1).max(2)}).strict();

/** Internal discovery, not permission. Claim checks time using database clock;
 * fresh admission and finalization separately validate tenant+binding.
 * Does not publish usernames, issue leases, or enqueue recurring work. */
export function onlineRatingQueueDiscovery(db:SupabaseClient,clock:()=>number=Date.now){
 return async(key:z.infer<typeof provider>,limit:number)=>{
  const input=selection.parse({provider:key,limit});
  const cutoff=new Date(clock()).toISOString();
  // Query branches separately to use the existing due/expired indexes,
  // then merge at most two candidates per branch without a table scan.
  const [pending,expired]=await Promise.all([
   db.from("student_rating_refresh_jobs").select("id,teacher_id,run_after")
    .eq("provider",input.provider).in("trigger_kind",supportedTriggers)
    .in("status",["pending","retry"]).lte("run_after",cutoff)
    .order("run_after",{ascending:true}).order("id",{ascending:true}).limit(limit),
   db.from("student_rating_refresh_jobs").select("id,teacher_id,lease_until")
    .eq("provider",input.provider).in("trigger_kind",supportedTriggers)
    .eq("status","running").lte("lease_until",cutoff)
    .order("lease_until",{ascending:true}).order("id",{ascending:true}).limit(limit),
  ]);
  if(pending.error||expired.error)throw new Error("Online rating queue unavailable");
  const ready=z.array(dueRow).max(limit).parse(pending.data).map(x=>({...x,available:Date.parse(x.run_after)}));
  const abandoned=z.array(expiredRow).max(limit).parse(expired.data).map(x=>({...x,available:Date.parse(x.lease_until)}));
  const candidates=[...ready,...abandoned].sort((a,b)=>a.available-b.available||
   (a.id===b.id?0:a.id<b.id?-1:1));
  const seen=new Set<string>();
  return candidates.filter(row=>{
   if(!Number.isSafeInteger(row.available)||row.available>Date.parse(cutoff)||seen.has(row.id))return false;
   seen.add(row.id);
   return true;
  }).slice(0,limit).map(row=>({teacherId:row.teacher_id,jobId:row.id,provider:input.provider}));
 };
}
