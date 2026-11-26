import {createHash} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherStudentProfile,StudentProfileError} from "./student-profile-service";

/** Federation registries represent optional public identities, not strength.
 * A three-letter default is ONLY a suggestion and is never evidence that
 * a student joined a national federation or that an ID was verified.
 */
export const federationCode=z.string().regex(/^[A-Z]{3}$/);
const isoToday=()=>new Date().toISOString().slice(0,10);
export const federationSummaryInput=z.object({
 studentId:z.uuid(),
 fideOn:z.iso.date().refine(date=>date>="1900-01-01"&&date<=isoToday(),
  "Expected a real date from 1900 through today UTC").optional(),
}).strict();
export const federationMembershipCreateSchema=z.object({
  studentId:z.uuid(),federationCode,playerId:z.string().trim().min(1).max(64),
  idempotencyKey:z.uuid(),confirmed:z.literal(true),
}).strict();
export const federationMembershipUpdateSchema=z.object({
  studentId:z.uuid(),membershipId:z.uuid(),playerId:z.string().trim().min(1).max(64),
  expectedRevision:z.number().int().min(1),idempotencyKey:z.uuid(),confirmed:z.literal(true),
}).strict();
export const federationManualRatingSchema=z.object({
  studentId:z.uuid(),provider:z.enum(["fide","icf"]),
  timeControl:z.enum(["standard","rapid","blitz","national"]),
  rating:z.number().int().min(100).max(4000),
  observedAt:z.iso.datetime({offset:true}),
  effectiveAt:z.iso.date().nullable().default(null),
  /** Source is a teacher note/reference, NOT provider verification. */
  sourceUrl:z.string().trim().url().regex(/^https:\/\//).max(600).nullable().default(null),
  requestId:z.uuid(),confirmed:z.literal(true),
}).strict().superRefine((x,ctx)=>{
 if((x.provider==="fide"&&!(["standard","rapid","blitz"] as string[]).includes(x.timeControl))||
    (x.provider==="icf"&&x.timeControl!=="national"))
  ctx.addIssue({code:"custom",path:["timeControl"],message:"Category is not supported by the selected federation"});
});
export class FederationError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string):never=>{
 throw new FederationError(status,code,message);
};
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function requireStudent(db:Db,teacherId:string,studentId:string){
 try{return await teacherStudentProfile(db,teacherId,studentId);}
 catch(error){
  if(error instanceof StudentProfileError)
   return fail(error.status,error.code,error.message);
  throw error;
 }
}
const membershipColumns="id,teacher_id,student_id,federation_code,player_id,membership_status,verified_at,source_url,revision,created_at,last_request_id,last_request_hash";
const snapshotColumns="id,student_id,provider,time_control,rating,source,observed_at,effective_at,fetched_at,source_url,source_digest,verification_state,request_id,created_at";
const historyColumns=`${snapshotColumns},external_player_id,provider_list_version`;
const fideCategories=["standard","rapid","blitz"] as const;
type Db=SupabaseClient;
type Row=Record<string,unknown>;
function safeMembership(r:Row){
 return {id:r.id,studentId:r.student_id,federationCode:r.federation_code,
  playerId:r.player_id,membershipStatus:r.membership_status,verifiedAt:r.verified_at,
  sourceUrl:r.source_url,revision:Number(r.revision),createdAt:r.created_at};
}
async function effectiveFideEvidence(db:Db,teacherId:string,studentId:string,fideId:string|null,effectiveThrough:string){
 const linkedId=fideId&&/^[0-9]+$/.test(fideId)?fideId:null;
 return Promise.all(fideCategories.map(async timeControl=>{
  if(!linkedId)return {timeControl,status:"not_linked",snapshot:null} as const;
  // This window is independent of the bounded mixed history and its observed-at ordering.
  // Two rows in the greatest effective period suffice to detect an unordered correction.
  const {data,error,count}=await db.from("student_rating_snapshots").select(historyColumns,{count:"exact"})
   .eq("teacher_id",teacherId).eq("student_id",studentId)
   .eq("provider","fide").eq("time_control",timeControl)
   .eq("source","provider_api").eq("verification_state","provider_published")
   .eq("external_player_id",linkedId).lte("effective_at",effectiveThrough)
   .order("effective_at",{ascending:false}).limit(2);
  if(error)return fail(503,"FEDERATION_UNAVAILABLE","Federation evidence could not be read");
  const rows=data??[];
  if(count===null||rows.length!==Math.min(count,2))
   return {timeControl,status:"evidence_incomplete",snapshot:null} as const;
  const [first,next]=rows;
  if(!first)return {timeControl,status:"not_recorded",snapshot:null} as const;
  if(next&&next.effective_at===first.effective_at)
   return {timeControl,status:"edition_order_unknown",snapshot:null} as const;
  return {timeControl,status:"recorded",snapshot:first} as const;
 }));
}
type EffectiveFideRows=Awaited<ReturnType<typeof effectiveFideEvidence>>;

function fideEvidenceExport(throughDate:string,rows:EffectiveFideRows){
 // A minimal copy of the reviewed projection, not the raw learner record.
 // Deliberately omit IDs, untrusted edition strings/URLs and unrelated data.
 return {
  format:"chesscoachpal_fide_effective_evidence_v1" as const,
  intendedAudience:"coach_private" as const,
  provider:"fide" as const,
  basis:"stored_editions_for_current_link" as const,
  historicalKnowledgeOrIdentity:false as const,
  throughDate,
  categories:rows.map(({timeControl,status,snapshot})=>({
   timeControl,status,
   evidence:snapshot?{
    rating:snapshot.rating,effectiveDate:snapshot.effective_at,
    provenance:"stored_provider_publication" as const,
   }:null,
  })),
 };
}
export type FideEvidenceExport=ReturnType<typeof fideEvidenceExport>;

export async function federationStudentSummary(db:Db,teacherId:string,studentId:string,fideOn?:string){
 const parsed=federationSummaryInput.safeParse({studentId,fideOn});
 if(!parsed.success)return fail(400,"VALIDATION_ERROR","Invalid federation summary filters");
 const today=isoToday();
 const student=await requireStudent(db,teacherId,studentId);
 const [member,history,teacher,fideEvidence,effectiveEvidence]=await Promise.all([
  db.from("student_federation_memberships").select(membershipColumns)
   .eq("teacher_id",teacherId).eq("student_id",studentId).order("federation_code"),
  db.from("student_rating_snapshots").select(historyColumns)
   .eq("teacher_id",teacherId).eq("student_id",studentId)
   .in("provider",["fide","icf"])
   .order("observed_at",{ascending:false}).order("id",{ascending:false}).limit(100),
  db.from("teachers").select("default_national_federation_code").eq("id",teacherId).maybeSingle(),
  effectiveFideEvidence(db,teacherId,studentId,student.fide_id??null,today),
  fideOn&&fideOn!==today?effectiveFideEvidence(db,teacherId,studentId,student.fide_id??null,fideOn):undefined,
 ]);
 if(member.error||history.error||teacher.error||!teacher.data)
  return fail(503,"FEDERATION_UNAVAILABLE","Federation records could not be read");
 const review=fideOn?(effectiveEvidence??fideEvidence):undefined;
 return {studentId,identity:{fideId:student.fide_id??null,
    fideFederationCode:student.fide_federation_code??null,
    defaultNationalFederationCode:teacher.data.default_national_federation_code??null,
    nationalFederationPreference:student.national_federation_preference??null,
    suggestedFederationCode:student.national_federation_preference==="NONE"?null:
      student.national_federation_preference??teacher.data.default_national_federation_code??null},
  memberships:(member.data??[]).map(r=>safeMembership(r)),
  snapshots:history.data??[],
  currentEvidence:{fide:fideEvidence},
  // Effective now from the stored editions for the currently linked ID.
  // This is not an audit of what the app knew, nor of the ID linked, on that date.
  ...(fideOn&&review?{fideEffectiveEvidence:{throughDate:fideOn,
    basis:"stored_editions_for_current_link" as const,fide:review},
    fideEvidenceExport:fideEvidenceExport(fideOn,review)}:{}),
  retrieval:{fide:"not_automated",icf:"manual_only"} as const,
  sourceWarning:"Teacher-entered FIDE/ICF identities and ratings are UNVERIFIED until independently matched against an authorized official source; no value changes chess strength or mastery."};
}
export async function federationMembershipCreate(db:Db,teacherId:string,
 raw:z.infer<typeof federationMembershipCreateSchema>){
 const x=federationMembershipCreateSchema.parse(raw);
 await requireStudent(db,teacherId,x.studentId);
 const fields={teacher_id:teacherId,student_id:x.studentId,
  federation_code:x.federationCode,player_id:x.playerId,
  membership_status:"unverified",verified_at:null,source_url:null};
 const digest=hash(fields);
 const {data,error}=await db.from("student_federation_memberships").insert({
  id:x.idempotencyKey,...fields,last_request_id:x.idempotencyKey,last_request_hash:digest,
 }).select(membershipColumns).maybeSingle();
 if(!error&&data)return {...safeMembership(data),replayed:false};
 if(error?.code==="23505"){
  const {data:prior,error:lookupError}=await db.from("student_federation_memberships")
   .select(membershipColumns).eq("id",x.idempotencyKey).eq("teacher_id",teacherId).maybeSingle();
  if(lookupError)fail(503,"FEDERATION_UNAVAILABLE","Membership replay lookup failed");
  if(prior&&prior.last_request_id===x.idempotencyKey&&prior.last_request_hash===digest)
   return {...safeMembership(prior),replayed:true};
  fail(409,"FEDERATION_CONFLICT","An existing federation membership or request ID conflicts");
 }
 return fail(503,"FEDERATION_UNAVAILABLE","Could not add federation identity");
}
export async function federationMembershipUpdate(db:Db,teacherId:string,
 raw:z.infer<typeof federationMembershipUpdateSchema>){
 const x=federationMembershipUpdateSchema.parse(raw);
 await requireStudent(db,teacherId,x.studentId);
 const digest=hash([x.studentId,x.membershipId,x.playerId,x.expectedRevision]);
 const {data,error}=await db.from("student_federation_memberships").update({
  player_id:x.playerId,revision:x.expectedRevision+1,
  // A changed ID is always unverified, even if previously matched externally.
  membership_status:"unverified",verified_at:null,source_url:null,
  last_request_id:x.idempotencyKey,last_request_hash:digest,
 }).eq("teacher_id",teacherId).eq("student_id",x.studentId)
  .eq("id",x.membershipId).eq("revision",x.expectedRevision)
  .select(membershipColumns).maybeSingle();
 if(error)fail(503,"FEDERATION_UNAVAILABLE","Could not update federation identity");
 if(data)return {...safeMembership(data),replayed:false};
 const {data:old,error:lookupError}=await db.from("student_federation_memberships")
  .select(membershipColumns).eq("id",x.membershipId).eq("teacher_id",teacherId)
  .eq("student_id",x.studentId).maybeSingle();
 if(lookupError)fail(503,"FEDERATION_UNAVAILABLE","Membership lookup failed");
 if(!old)return fail(404,"NOT_FOUND","Membership not found");
 if(old.last_request_id===x.idempotencyKey&&old.last_request_hash===digest)
  return {...safeMembership(old),replayed:true};
 return fail(409,"STALE_REVISION","Federation player ID changed; reload before editing");
}
export async function federationManualRatingRecord(db:Db,teacherId:string,
 raw:z.infer<typeof federationManualRatingSchema>){
 const x=federationManualRatingSchema.parse(raw);
 await requireStudent(db,teacherId,x.studentId);
 if(Date.parse(x.observedAt)>Date.now()+86400000)
  fail(400,"INVALID_DATE","Manual rating observation cannot be in the future");
 if(x.effectiveAt&&x.effectiveAt>new Date(Date.now()+86400000).toISOString().slice(0,10))
  fail(400,"INVALID_DATE","Rating list effective date cannot be in the future");
 const fields={teacher_id:teacherId,student_id:x.studentId,provider:x.provider,
  time_control:x.timeControl,rating:x.rating,observed_at:x.observedAt,
  effective_at:x.effectiveAt,source_url:x.sourceUrl,
  source:"teacher_manual",fetched_at:null,
  verification_state:"unverified",rating_deviation:null,provisional:null,games:null};
 const digest=hash(fields);
 const {data,error}=await db.from("student_rating_snapshots").insert({
  ...fields,request_id:x.requestId,source_digest:digest,
 }).select(snapshotColumns).maybeSingle();
 if(!error&&data)return {snapshot:data,replayed:false,teacherStrengthChanged:false};
 if(error?.code==="23505"){
  const {data:prior,error:lookupError}=await db.from("student_rating_snapshots")
   .select(snapshotColumns).eq("teacher_id",teacherId).eq("request_id",x.requestId).maybeSingle();
  if(lookupError)fail(503,"FEDERATION_UNAVAILABLE","Rating replay lookup failed");
  if(prior&&prior.source_digest===digest&&prior.source==="teacher_manual")
   return {snapshot:prior,replayed:true,teacherStrengthChanged:false};
  fail(409,"IDEMPOTENCY_CONFLICT","Rating request ID was used for different evidence");
 }
 return fail(503,"FEDERATION_UNAVAILABLE","Could not store manual rating observation");
}

/** Teacher profile preference is an autocomplete hint, never a relationship. */
export const federationDefaultUpdateSchema=z.object({
 defaultNationalFederationCode:federationCode.nullable(),
 expectedDefaultNationalFederationCode:federationCode.nullable(),
 confirmed:z.literal(true),
}).strict();
export async function federationDefaultGet(db:Db,teacherId:string){
 const {data,error}=await db.from("teachers")
  .select("default_national_federation_code").eq("id",teacherId).maybeSingle();
 if(error)fail(503,"FEDERATION_UNAVAILABLE","Cannot read federation preference");
 if(!data)return fail(404,"NOT_FOUND","Teacher account unavailable");
 return {defaultNationalFederationCode:data.default_national_federation_code as string|null};
}
export async function federationDefaultSet(db:Db,teacherId:string,
 input:z.infer<typeof federationDefaultUpdateSchema>){
 const x=federationDefaultUpdateSchema.parse(input);
 let q=db.from("teachers").update({
  default_national_federation_code:x.defaultNationalFederationCode,
 }).eq("id",teacherId);
 q=x.expectedDefaultNationalFederationCode===null?
  q.is("default_national_federation_code",null):
  q.eq("default_national_federation_code",x.expectedDefaultNationalFederationCode);
 const {data,error}=await q.select("id").maybeSingle();
 if(error)fail(503,"FEDERATION_UNAVAILABLE","Cannot update federation preference");
 const current=await federationDefaultGet(db,teacherId);
 if(data)return {...current,replayed:false};
 if(current.defaultNationalFederationCode===x.defaultNationalFederationCode)
  return {...current,replayed:true};
 return fail(409,"STALE_REVISION","Federation preference changed; reload before editing");
}
