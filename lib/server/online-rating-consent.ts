import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {provider} from "@/lib/chess-public-ratings";
import {createServiceClient} from "@/lib/supabase/server";
import {teacherStudentProfile} from "./student-profile-service";
import {StudentRatingError} from "./online-rating-transport";

const username=z.string().regex(/^[A-Za-z0-9_-]{2,30}$/);
const epoch=z.string().regex(/^[1-9][0-9]{0,18}$/);
const revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const previewInput=z.object({studentId:z.uuid(),provider}).strict();
const binding=z.object({epoch,archived:z.boolean(),handle:z.string().nullable()}).strict();
const stored=z.object({enabled:z.boolean(),revision}).strict();
const receipt=z.discriminatedUnion("status",[
 z.object({status:z.literal("accepted"),jobId:z.uuid(),replayed:z.boolean()}).strict(),
 z.object({status:z.literal("revoked"),replayed:z.boolean()}).strict(),
 z.object({status:z.literal("stale")}).strict(),
 z.object({status:z.literal("provider_unavailable")}).strict(),
]);
export const onlineRatingConsentReadSchema=previewInput;
export const onlineRatingConsentApplySchema=previewInput.extend({
 username,studentEpoch:epoch,expectedRevision:revision,enable:z.boolean(),
 requestId:z.uuid(),confirmed:z.literal(true),
}).strict();
const fail=(status:number,code:string,message:string)=>new StudentRatingError(status,code,message);
const unavailable=()=>fail(503,"RATING_CONSENT_UNAVAILABLE","Automatic rating permission could not be verified");

/** Shared teacher service only. No route/approval or provider execution is
 * registered here. Callers must supply a signed owner context and, for agent
 * writes, a separately verified exact human approval. */
export async function teacherOnlineRatingConsentRead(db:SupabaseClient,teacherId:string,
 input:z.infer<typeof onlineRatingConsentReadSchema>){
 const value=onlineRatingConsentReadSchema.parse(input);
 await teacherStudentProfile(db,teacherId,value.studentId);
 const admin=createServiceClient();
 const {data,error}=await admin.rpc("ccp_manual_online_rating_binding",{
  p_teacher_id:teacherId,p_student_id:value.studentId,p_provider:value.provider,
 });
 if(error)throw unavailable();
 if(data===null)throw fail(404,"NOT_FOUND","Student not found");
 const current=binding.safeParse(data);
 if(!current.success)throw unavailable();
 const old=await admin.from("student_rating_sync_consents").select("enabled,revision")
  .eq("teacher_id",teacherId).eq("student_id",value.studentId).eq("provider",value.provider).maybeSingle();
 if(old.error)throw unavailable();
 const saved=old.data===null?null:stored.safeParse(old.data);
 if(saved&&!saved.success)throw unavailable();
 const configured=username.safeParse(current.data.handle);
 const on=saved?.data?.enabled??false;
 return {studentId:value.studentId,provider:value.provider,
  username:configured.success?configured.data:null,studentEpoch:current.data.epoch,
  expectedRevision:saved?.data?.revision??0,enabled:on,
  canChange:configured.success&&!current.data.archived,accountOwnershipVerified:false};
}

export async function teacherOnlineRatingConsentApply(db:SupabaseClient,teacherId:string,
 input:z.infer<typeof onlineRatingConsentApplySchema>){
 const value=onlineRatingConsentApplySchema.parse(input);
 await teacherStudentProfile(db,teacherId,value.studentId);
 const {data,error}=await createServiceClient().rpc("ccp_online_rating_consent_apply",{
  p_teacher_id:teacherId,p_student_id:value.studentId,p_provider:value.provider,
  p_username:value.username,p_student_epoch:value.studentEpoch,
  p_expected_revision:value.expectedRevision,p_enable:value.enable,p_request_id:value.requestId,
 });
 if(error?.code==="55P03"||error?.code==="40001")
  throw fail(409,"RATING_CONSENT_CONTEXT_BUSY","Student context is busy; retry this exact decision");
 if(error?.code==="23505")
  throw fail(409,"IDEMPOTENCY_CONFLICT","Request ID belongs to a different rating permission decision");
 if(error)throw unavailable();
 if(data===null)throw fail(404,"NOT_FOUND","Student not found");
 const checked=receipt.safeParse(data);
 if(!checked.success)throw unavailable();
 if(checked.data.status==="stale")
  throw fail(409,"RATING_CONSENT_STALE","The saved account or permission changed; review again");
 if(checked.data.status==="provider_unavailable")
  throw fail(409,"RATING_PROVIDER_UNAVAILABLE","This provider is not available for automatic ratings");
 if(value.enable!==(checked.data.status==="accepted"))throw unavailable();
 // Historical accepted replay is never a claim about current permission.
 return {...checked.data,studentId:value.studentId,provider:value.provider};
}
