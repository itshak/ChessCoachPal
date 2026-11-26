import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {provider} from "../chess-public-ratings";
import {belongsToCurrentOnlineRating,onlineRatingStaleAfterMs} from "./online-rating-freshness";

const timestamp=z.iso.datetime({offset:true});
const activeHandle=z.string().regex(/^[A-Za-z0-9_-]{2,30}$/);
const revision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const uuid=z.uuid();
const maxBindings=12; // Bounds the exact composite OR predicate sent to PostgREST.
const maxObservations=96;
type State="recent"|"stale"|"no_observation"|"unknown";
const counters=():Record<State,number>=>({recent:0,stale:0,no_observation:0,unknown:0});
const candidate=z.object({
 id:uuid,student_id:uuid,source_username:activeHandle,handle_revision:revision,
 consented_at:timestamp,
 learner:z.object({lichess_username:z.string().nullable(),chesscom_username:z.string().nullable()}).strict(),
}).strict();
const snapshot=z.object({
 student_id:uuid,source:z.literal("provider_api"),source_username:activeHandle,source_handle_revision:revision,
 fetched_at:timestamp,observed_at:timestamp,
}).strict();
type Key=z.infer<typeof provider>;
type Candidate=z.infer<typeof candidate>;

async function loadBindings(db:SupabaseClient,teacherId:string,key:Key){
 const result=await db.from("student_rating_sync_consents")
  .select("id,student_id,source_username,handle_revision,consented_at,learner:students!inner(lichess_username,chesscom_username)")
  .eq("teacher_id",teacherId).eq("provider",key).eq("enabled",true).is("revoked_at",null)
  .is("learner.archived_at",null).order("id").limit(maxBindings+1);
 const parsed=z.array(candidate).max(maxBindings+1).safeParse(result.data);
 if(result.error||!parsed.success||new Set(parsed.data.map(c=>c.student_id)).size!==parsed.data.length)return null;
 return parsed.data;
}
const handle=(c:Candidate,key:Key)=>(key==="lichess"?c.learner.lichess_username:c.learner.chesscom_username)?.trim();
const same=(a:Candidate,b:Candidate|undefined,key:Key)=>b!==undefined&&a.student_id===b.student_id&&
 a.source_username===b.source_username&&a.handle_revision===b.handle_revision&&
 a.consented_at===b.consented_at&&handle(a,key)===handle(b,key);

/** Read bounded samples under the owner's signed RLS, never call a provider.
 * Not an as-of reconstruction, cohort total, or source of learner identities. */
export async function teacherDailyRatingFreshness(
 db:SupabaseClient,teacherId:string,workplaceId:string|null,now:Date,
){
 if(workplaceId!==null)return {status:"workplace_scope_unavailable"} as const;
 if(!Number.isFinite(now.getTime()))return {status:"unavailable"} as const;
 const providers=await Promise.all(provider.options.map(async key=>{
  const unavailable={provider:key,status:"unavailable"} as const;
  try{
   const initial=await loadBindings(db,teacherId,key);
   if(!initial)return unavailable;
   const sampled=initial.slice(0,maxBindings);
   const skipped=sampled.filter(c=>handle(c,key)!==c.source_username||Date.parse(c.consented_at)>now.getTime());
   const eligible=sampled.filter(c=>!skipped.includes(c));
   const counts=counters();
   counts.unknown=skipped.length;
   if(!eligible.length)return {provider:key,status:"ready" as const,counts,partial:initial.length>maxBindings};
   const tuples=eligible.map(c=>"and(student_id.eq."+c.student_id+
    ",source_handle_revision.eq."+c.handle_revision+",source_username.eq."+c.source_username+
    ",fetched_at.gte."+new Date(c.consented_at).toISOString()+")");
   // UUID, handle and integer all come from closed grammars above; dates are
   // regenerated as fixed UTC ISO scalars, not untrusted PostgREST fragments.
   const result=await db.from("student_rating_snapshots")
    .select("student_id,source,source_username,source_handle_revision,fetched_at,observed_at")
    .eq("teacher_id",teacherId).eq("provider",key).eq("source","provider_api").lte("fetched_at",now.toISOString())
    .or(tuples.join(",")).order("fetched_at",{ascending:false}).order("observed_at",{ascending:false})
    .order("id",{ascending:false}).limit(maxObservations+1);
   const parsed=z.array(snapshot).max(maxObservations+1).safeParse(result.data);
   if(result.error||!parsed.success)return unavailable;
   const final=await loadBindings(db,teacherId,key);
   if(!final)return unavailable;
   const hasMore=parsed.data.length>maxObservations;
   for(const c of eligible){
    const current=final.find(x=>x.id===c.id);
    if(!same(c,current,key)){counts.unknown++;continue;}
    const match=parsed.data.slice(0,maxObservations).find(x=>x.student_id===c.student_id);
    if(!match){counts[hasMore?"unknown":"no_observation"]++;continue;}
    const valid=belongsToCurrentOnlineRating({status:"bound",binding:{consentId:c.id,handle:c.source_username,
     revision:c.handle_revision,permittedSince:Date.parse(c.consented_at)}},match,now.getTime());
    if(!valid){counts.unknown++;continue;}
    counts[now.getTime()-Date.parse(match.fetched_at)>=onlineRatingStaleAfterMs?"stale":"recent"]++;
   }
   return {provider:key,status:"ready" as const,counts,
    partial:initial.length>maxBindings||final.length>maxBindings||hasMore||
     initial.length!==final.length||counts.unknown>0};
  }catch{return unavailable;}
 }));
 return {status:"ready" as const,providers};
}
