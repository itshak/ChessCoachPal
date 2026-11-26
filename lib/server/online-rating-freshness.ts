import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {provider,timeControl} from "../chess-public-ratings";

type Provider=z.infer<typeof provider>;
type Student={archived_at:string|null;lichess_username:string|null;chesscom_username:string|null};
const timestamp=z.iso.datetime({offset:true});
const username=z.string().regex(/^[A-Za-z0-9_-]{2,30}$/);
const safeRevision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const consent=z.object({
 provider,enabled:z.boolean(),source_username:username,handle_revision:safeRevision,
 consented_at:timestamp.nullable(),
}).strict();
const observation=z.object({
 source:z.literal("provider_api"),source_username:username,source_handle_revision:safeRevision,
 observed_at:timestamp,fetched_at:timestamp,time_control:timeControl,
}).strict();
type Binding={handle:string;revision:number;permittedSince:number};
type BindingState={status:"bound";binding:Binding}|
 {status:"archived"|"not_linked"|"permission_off"|"unavailable"};
type PublicObservation={observedAt:string;fetchedAt:string;timeControl:z.infer<typeof timeControl>};
type Freshness= {provider:Provider;status:Exclude<BindingState["status"],"bound">|"no_observation";
 lastObservation:null} | {provider:Provider;status:"recent"|"stale";lastObservation:PublicObservation};

const fields="source,source_username,source_handle_revision,observed_at,fetched_at,time_control";
const staleAfterMs=48*60*60*1000; // 24h minimum recurrence plus one day of tolerance.
function instant(value:unknown):number{
 return typeof value==="string"&&timestamp.safeParse(value).success?Date.parse(value):NaN;
}

/** Current automatic evidence must be of the exact current binding, not merely
 * a handle with the same spelling or a previously human-approved one-shot. */
export function belongsToCurrentOnlineRating(state:BindingState,row:{
 source:unknown;source_username:unknown;source_handle_revision:unknown;
 observed_at:unknown;fetched_at:unknown;
},now:number):boolean{
 if(state.status!=="bound"||row.source!=="provider_api"||
  row.source_username!==state.binding.handle||row.source_handle_revision!==state.binding.revision)return false;
 const fetched=instant(row.fetched_at),observed=instant(row.observed_at);
 return Number.isFinite(observed)&&observed<=fetched&&
  fetched>=state.binding.permittedSince&&fetched<=now;
}

/** Read under the owner's already authenticated RLS; callers prove the
 * student first and only publish providers, never the private bindings. */
export async function readOnlineRatingFreshness(
 db:SupabaseClient,teacherId:string,studentId:string,student:Student,now=Date.now(),
){
 const baseline=(key:Provider):BindingState["status"]=>{
  if(student.archived_at!==null)return "archived";
  const handle=(key==="lichess"?student.lichess_username:student.chesscom_username)?.trim();
  return username.safeParse(handle).success?"unavailable":"not_linked";
 };
 const states={lichess:{status:baseline("lichess")},chesscom:{status:baseline("chesscom")}} as Record<Provider,BindingState>;
 const enabledKeys=provider.options.filter(key=>states[key].status==="unavailable");
 if(enabledKeys.length>0&&Number.isSafeInteger(now)&&now>=0&&now<=8_640_000_000_000_000){
  try{
   const resp=await db.from("student_rating_sync_consents")
    .select("provider,enabled,source_username,handle_revision,consented_at")
    .eq("teacher_id",teacherId).eq("student_id",studentId).in("provider",enabledKeys).limit(3);
   const parsed=z.array(consent).max(enabledKeys.length).safeParse(resp.data);
   if(!resp.error&&parsed.success&&new Set(parsed.data.map(row=>row.provider)).size===parsed.data.length&&
     parsed.data.every(row=>enabledKeys.includes(row.provider))){
    for(const key of enabledKeys){
     const current=parsed.data.find(row=>row.provider===key);
     const handle=(key==="lichess"?student.lichess_username:student.chesscom_username)?.trim();
     if(!current||!current.enabled||current.source_username!==handle){
      states[key]={status:"permission_off"};continue;
     }
     const permittedSince=instant(current.consented_at);
     if(Number.isFinite(permittedSince)&&permittedSince<=now){
      states[key]={status:"bound",binding:{handle:current.source_username,
       revision:current.handle_revision,permittedSince}};
     }
    }
   }
  }catch{/* Do not turn stale or unavailable evidence into a current rating. */}
 }
 const providers=await Promise.all(provider.options.map(async(key):Promise<Freshness>=>{
  const state=states[key];
  if(state.status!=="bound")return {provider:key,status:state.status,lastObservation:null};
  const unavailable={provider:key,status:"unavailable",lastObservation:null} as const;
  try{
   const {binding}=state;
   const response=await db.from("student_rating_snapshots").select(fields)
    .eq("teacher_id",teacherId).eq("student_id",studentId).eq("provider",key).eq("source","provider_api")
    .eq("source_username",binding.handle).eq("source_handle_revision",binding.revision)
    .gte("fetched_at",new Date(binding.permittedSince).toISOString())
    .order("fetched_at",{ascending:false}).order("observed_at",{ascending:false})
    .order("id",{ascending:false}).limit(1).maybeSingle();
   if(response.error)return unavailable;
   if(response.data===null)return {provider:key,status:"no_observation",lastObservation:null};
   const row=observation.safeParse(response.data);
   if(!row.success||!belongsToCurrentOnlineRating(state,row.data,now))return unavailable;
   return {provider:key,status:now-Date.parse(row.data.fetched_at)>=staleAfterMs?"stale":"recent",
    lastObservation:{observedAt:row.data.observed_at,fetchedAt:row.data.fetched_at,timeControl:row.data.time_control}};
  }catch{return unavailable;}
 }));
 return {states,providers};
}
