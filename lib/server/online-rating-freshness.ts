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
 id:z.uuid(),provider,enabled:z.boolean(),source_username:username,handle_revision:safeRevision,
 consented_at:timestamp.nullable(),
}).strict();
const observation=z.object({
 source:z.literal("provider_api"),source_username:username,source_handle_revision:safeRevision,
 observed_at:timestamp,fetched_at:timestamp,time_control:timeControl,
}).strict();
type Binding={consentId:string;handle:string;revision:number;permittedSince:number};
type BindingState={status:"bound";binding:Binding}|
 {status:"archived"|"not_linked"|"permission_off"|"unavailable"};
type PublicObservation={observedAt:string;fetchedAt:string;timeControl:z.infer<typeof timeControl>};
type Freshness=({provider:Provider;status:Exclude<BindingState["status"],"bound">|"no_observation";
 lastObservation:null} | {provider:Provider;status:"recent"|"stale";lastObservation:PublicObservation})&{latestRefresh:LatestRefresh|null};

const fields="source,source_username,source_handle_revision,observed_at,fetched_at,time_control";
export const onlineRatingStaleAfterMs=48*60*60*1000; // 24h minimum recurrence plus one day of tolerance.
function instant(value:unknown):number{
 return typeof value==="string"&&timestamp.safeParse(value).success?Date.parse(value):NaN;
}

const refreshTrigger=z.enum(["profile_save","manual","scheduled"]);
const refreshRow=z.object({
 consent_id:z.uuid(),source_username:username,handle_revision:safeRevision,trigger_kind:refreshTrigger,
 status:z.enum(["pending","running","retry","succeeded","stale","failed","cancelled"]),
 created_at:timestamp,updated_at:timestamp,finished_at:timestamp.nullable(),lease_until:timestamp.nullable(),
 last_error_code:z.string().max(80).nullable(),
}).strict();
type PublicReason="rate_limited"|"account_not_found"|"provider_denied"|"temporary"|"other";
type LatestRefresh={status:"none"|"unavailable"}|{
 status:"queued"|"in_progress"|"retry_wait"|"interrupted"|"succeeded"|"superseded"|"failed"|"cancelled";
 queuedAt:string;updatedAt:string;finishedAt:string|null;reason:PublicReason|null;
};
function publicReason(code:string|null):PublicReason{
 switch(code){
  case "RATE_LIMITED":return "rate_limited";
  case "ACCOUNT_NOT_FOUND":return "account_not_found";
  case "PROVIDER_DENIED":return "provider_denied";
  case "PROVIDER_UNAVAILABLE":
  case "RATING_PROVIDER_UNAVAILABLE":return "temporary";
  default:return "other";
 }
}
async function readLatestRefresh(
 db:SupabaseClient,teacherId:string,studentId:string,key:Provider,binding:Binding,now:number,
):Promise<LatestRefresh>{
 const unavailable={status:"unavailable"} as const;
 try{
  const result=await db.from("student_rating_refresh_jobs")
   .select("consent_id,source_username,handle_revision,trigger_kind,status,created_at,updated_at,finished_at,lease_until,last_error_code")
   .eq("teacher_id",teacherId).eq("student_id",studentId).eq("provider",key)
   .eq("consent_id",binding.consentId).eq("source_username",binding.handle)
   .eq("handle_revision",binding.revision).in("trigger_kind",refreshTrigger.options)
   .gte("created_at",new Date(binding.permittedSince).toISOString())
   .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle();
  if(result.error)return unavailable;
  if(result.data===null)return {status:"none"};
  const parsed=refreshRow.safeParse(result.data);
  if(!parsed.success)return unavailable;
  const row=parsed.data;
  const created=instant(row.created_at),updated=instant(row.updated_at),finished=instant(row.finished_at);
  const terminal=["succeeded","stale","failed","cancelled"].includes(row.status);
  if(row.consent_id!==binding.consentId||row.source_username!==binding.handle||
   row.handle_revision!==binding.revision||created<binding.permittedSince||updated<created||updated>now||
   terminal!==(row.finished_at!==null)||(terminal&&(finished<created||finished>updated))||
   (row.status==="running"&&row.lease_until===null))return unavailable;
  const status=({pending:"queued",running:instant(row.lease_until)>now?"in_progress":"interrupted",
   retry:"retry_wait",succeeded:"succeeded",stale:"superseded",failed:"failed",cancelled:"cancelled"} as const)[row.status];
  return {status,queuedAt:row.created_at,updatedAt:row.updated_at,finishedAt:row.finished_at,
   reason:row.status==="failed"||row.status==="retry"?publicReason(row.last_error_code):null};
 }catch{return unavailable;}
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
    .select("id,provider,enabled,source_username,handle_revision,consented_at")
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
      states[key]={status:"bound",binding:{consentId:current.id,handle:current.source_username,
       revision:current.handle_revision,permittedSince}};
     }
    }
   }
  }catch{/* Do not turn stale or unavailable evidence into a current rating. */}
 }
 const providers=await Promise.all(provider.options.map(async(key):Promise<Freshness>=>{
  const state=states[key];
  if(state.status!=="bound")return {provider:key,status:state.status,lastObservation:null,latestRefresh:null};
  const latest=readLatestRefresh(db,teacherId,studentId,key,state.binding,now);
  const noObservation={provider:key,lastObservation:null} as const;
  try{
   const {binding}=state;
   const response=await db.from("student_rating_snapshots").select(fields)
    .eq("teacher_id",teacherId).eq("student_id",studentId).eq("provider",key).eq("source","provider_api")
    .eq("source_username",binding.handle).eq("source_handle_revision",binding.revision)
    .gte("fetched_at",new Date(binding.permittedSince).toISOString())
    .order("fetched_at",{ascending:false}).order("observed_at",{ascending:false})
    .order("id",{ascending:false}).limit(1).maybeSingle();
   if(response.error)return {...noObservation,status:"unavailable",latestRefresh:await latest};
   if(response.data===null)return {...noObservation,status:"no_observation",latestRefresh:await latest};
   const row=observation.safeParse(response.data);
   if(!row.success||!belongsToCurrentOnlineRating(state,row.data,now))return {...noObservation,status:"unavailable",latestRefresh:await latest};
   return {provider:key,status:now-Date.parse(row.data.fetched_at)>=onlineRatingStaleAfterMs?"stale":"recent",
    latestRefresh:await latest,lastObservation:{observedAt:row.data.observed_at,fetchedAt:row.data.fetched_at,timeControl:row.data.time_control}};
  }catch{return {...noObservation,status:"unavailable",latestRefresh:await latest};}
 }));
 return {states,providers};
}
