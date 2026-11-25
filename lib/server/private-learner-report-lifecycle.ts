import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {
 PrivateLearnerReportError,privateLearnerReportCandidate,privateLearnerReportGetInput,
} from "@/lib/server/private-learner-report";
import {locales} from "@/i18n/locales";

const id=z.string().uuid();
const digest=z.string().regex(/^[0-9a-f]{64}$/);
const revision=z.string().regex(/^[1-9]\d*$/);
const time=z.string().datetime({offset:true});
export const reportLifecycleChoicesInput=privateLearnerReportGetInput;
export const reportLifecycleReviewInput=privateLearnerReportGetInput.extend({
 replacementId:id.nullable(),
}).strict();
export const reportLifecycleCommitInput=reportLifecycleReviewInput.extend({
 reviewDigest:digest,requestId:id,confirmed:z.literal(true),
}).strict();
const exactReport=z.object({
 publicationId:id,snapshotDigest:digest,revision,approvedAt:time,candidate:privateLearnerReportCandidate,
}).strict();
const reviewShape=z.object({
 action:z.enum(["revoke","supersede"]),studentId:id,workplaceId:id,original:exactReport,
 replacement:exactReport.nullable(),notWithdrawnApprovals:z.number().int().nonnegative(),reviewDigest:digest,
}).strict();
const receiptShape=z.object({
 publicationId:id,revision,snapshotDigest:digest,replacementId:id.nullable(),revokedAt:time.nullable(),
 status:z.enum(["revoked","superseded"]),
}).strict();
const choiceRows=z.array(z.object({
 id,output_locale:z.enum(locales),approved_at:time,
}).strict()).max(31);
export type ReportLifecycleReview=z.infer<typeof reviewShape>;
export type ReportLifecycleReceipt=z.infer<typeof receiptShape>;
export type ReportLifecycleChoices={
 choices:{publicationId:string;outputLocale:z.infer<typeof privateLearnerReportCandidate>["outputLocale"];approvedAt:string}[];
 truncated:boolean;
};
type Scope=z.infer<typeof reportLifecycleChoicesInput>;
type Review=z.infer<typeof reportLifecycleReviewInput>;
type Commit=z.infer<typeof reportLifecycleCommitInput>;

const unavailable=()=>new PrivateLearnerReportError(503,"DATABASE_ERROR","Saved report decision unavailable");
const notFound=()=>new PrivateLearnerReportError(404,"NOT_FOUND","Saved report not found");
function failure(error:{message:string}):never{
 switch(error.message){
  case "REPORT_LIFECYCLE_NOT_FOUND":throw notFound();
  case "REPORT_LIFECYCLE_INVALID":case "REPORT_LIFECYCLE_APPROVAL_REQUIRED":
   throw new PrivateLearnerReportError(400,"VALIDATION_ERROR","Confirm the exact saved report decision");
  case "REPORT_LIFECYCLE_STALE":
   throw new PrivateLearnerReportError(409,"REPORT_LIFECYCLE_STALE","The report or its audience has changed");
  case "REPORT_REPLACEMENT_NOT_PRIVATE_OR_IN_SCOPE":
   throw new PrivateLearnerReportError(409,"REPORT_REPLACEMENT_UNAVAILABLE","Choose a newer, private report for the same learner and workplace");
  case "REPORT_LIFECYCLE_IDEMPOTENCY_CONFLICT":
   throw new PrivateLearnerReportError(409,"IDEMPOTENCY_CONFLICT","This approval key already has different details");
  case "FORBIDDEN":throw new PrivateLearnerReportError(403,"FORBIDDEN","Saved report decision unavailable");
  default:throw unavailable();
 }
}
async function parsed<T extends z.ZodType>(shape:T,
 result:PromiseLike<{data:unknown;error:{message:string}|null}>):Promise<z.infer<T>>{
 const {data,error}=await result;
 if(error)failure(error);
 const value=shape.safeParse(data);
 if(!value.success)throw unavailable();
 return value.data;
}
async function scopedReport(db:SupabaseClient,teacherId:string,input:Scope){
 const row=await db.from("report_publications")
  .select("workplace_id,approved_at,revoked_at,superseded_by")
  .eq("teacher_id",teacherId).eq("student_id",input.studentId).eq("id",input.publicationId)
  .eq("snapshot_storage_ref","db:report:v1:"+input.publicationId).maybeSingle();
 if(row.error)throw unavailable();
 if(!row.data?.workplace_id)throw notFound();
 return row.data;
}

export async function listReportLifecycleChoices(db:SupabaseClient,teacherId:string,input:Scope):Promise<ReportLifecycleChoices>{
 const original=await scopedReport(db,teacherId,input);
 if(original.revoked_at||original.superseded_by)return {choices:[],truncated:false};
 const result=await db.from("report_publications")
  .select("id,output_locale,approved_at").eq("teacher_id",teacherId).eq("student_id",input.studentId)
  .eq("workplace_id",original.workplace_id).gt("approved_at",original.approved_at)
  .is("revoked_at",null).is("superseded_by",null).like("snapshot_storage_ref","db:report:v1:%")
  .order("approved_at",{ascending:false}).order("id",{ascending:false}).limit(31);
 if(result.error)throw unavailable();
 const rows=choiceRows.safeParse(result.data);
 if(!rows.success)throw unavailable();
 if(!rows.data.length)return {choices:[],truncated:false};
 const audience=await db.from("report_publication_audiences").select("publication_id")
  .eq("teacher_id",teacherId).in("publication_id",rows.data.map(row=>row.id))
  .not("approved_grant_binding","is",null);
 if(audience.error)throw unavailable();
 const previouslyBound=new Set((audience.data??[]).map(row=>row.publication_id));
 return {choices:rows.data.filter(row=>!previouslyBound.has(row.id)).slice(0,30).map(row=>({
  publicationId:row.id,outputLocale:row.output_locale,approvedAt:row.approved_at,
 })),truncated:rows.data.length>30};
}
export async function reviewReportLifecycle(db:SupabaseClient,teacherId:string,input:Review){
 await scopedReport(db,teacherId,input);
 const reviewed=await parsed(reviewShape,db.rpc("ccp_private_report_lifecycle_review",{
  p_publication:input.publicationId,p_replacement:input.replacementId,
 }));
 if(reviewed.studentId!==input.studentId||reviewed.original.publicationId!==input.publicationId||
  (reviewed.replacement?.publicationId??null)!==input.replacementId)throw unavailable();
 return reviewed;
}
export async function commitReportLifecycle(db:SupabaseClient,teacherId:string,input:Commit){
 // Historical rows remain in scope after a terminal transition, so a lost
 // delivery can replay the original receipt without another revision.
 await scopedReport(db,teacherId,input);
 return parsed(receiptShape,db.rpc("ccp_private_report_lifecycle_commit",{
  p_publication:input.publicationId,p_replacement:input.replacementId,p_review_digest:input.reviewDigest,
  p_request:input.requestId,p_confirm:input.confirmed,
 }));
}
