import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {locales} from "@/i18n/locales";
import {learnerReportPreviewInput} from "@/lib/server/learner-report-preview";
import {validateReportRange} from "@/lib/coaching-report";

const digest=z.string().regex(/^[0-9a-f]{64}$/);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const outcome=z.enum(["present","late","absent","excused","student_cancelled","teacher_cancelled","unknown"]);
const state=z.enum(["sealed","revoked","superseded"]);
export const privateLearnerReportCandidate=z.object({
 from:date,to:date,outputLocale:z.enum(locales),dateBasis:z.literal("recorded_session_local_date"),
 records:z.array(z.object({localDate:date,attendance:outcome}).strict()).max(500),
}).strict();
const bound=z.object({
 status:z.literal("teacher_preview_only"),writesPerformed:z.literal(false),candidate:privateLearnerReportCandidate,reviewDigest:digest,
}).strict();
const receipt=z.object({
 publicationId:z.string().uuid(),snapshotDigest:digest,approvedAt:z.string().datetime(),
 receiptType:z.literal("teacher_private_seal"),
}).strict();
const snapshot=z.object({
 publicationId:z.string().uuid(),snapshotDigest:digest,revision:z.string().regex(/^[1-9]\d*$/),
 status:state,candidate:privateLearnerReportCandidate,
}).strict();

export const privateLearnerReportReviewInput=learnerReportPreviewInput;
export const privateLearnerReportSaveInput=learnerReportPreviewInput.extend({
 reviewDigest:digest,requestId:z.string().uuid(),confirmed:z.literal(true),
}).strict();
export const privateLearnerReportListInput=z.object({studentId:z.string().uuid()}).strict();
export const privateLearnerReportGetInput=privateLearnerReportListInput.extend({publicationId:z.string().uuid()}).strict();
type Scope=z.infer<typeof learnerReportPreviewInput>;
export type BoundLearnerReport=z.infer<typeof bound>;
export type PrivateLearnerReportReceipt=z.infer<typeof receipt>;
export type PrivateLearnerReportSnapshot=z.infer<typeof snapshot>;
export type PrivateLearnerReportSave=z.infer<typeof privateLearnerReportSaveInput>;
export type PrivateLearnerReportSummary={
 publicationId:string;workplaceId:string;outputLocale:z.infer<typeof privateLearnerReportCandidate>["outputLocale"];
 approvedAt:string;status:z.infer<typeof state>;
};

export class PrivateLearnerReportError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const unavailable=()=>new PrivateLearnerReportError(503,"DATABASE_ERROR","Private report unavailable");
const notFound=()=>new PrivateLearnerReportError(404,"NOT_FOUND","Private report scope not found");
function failure(error:{message:string;code?:string}|null):never{
 switch(error?.message){
  case "REPORT_SCOPE_NOT_FOUND":case "REPORT_SNAPSHOT_UNAVAILABLE":throw notFound();
  case "REPORT_REVIEW_INVALID":case "REPORT_APPROVAL_REQUIRED":
   throw new PrivateLearnerReportError(400,"VALIDATION_ERROR","Choose valid report details and approve the exact review");
  case "REPORT_REVIEW_EMPTY":
   throw new PrivateLearnerReportError(400,"EMPTY_REPORT","There are no qualifying lessons to save");
  case "REPORT_REVIEW_TOO_LARGE":
   throw new PrivateLearnerReportError(413,"RANGE_TOO_LARGE","Use a shorter report range");
  case "REPORT_REVIEW_STALE":
   throw new PrivateLearnerReportError(409,"REPORT_REVIEW_STALE","Review the changed report before saving");
  case "REPORT_REQUEST_CONFLICT":
   throw new PrivateLearnerReportError(409,"IDEMPOTENCY_CONFLICT","This approval key already has different details");
  case "UPGRADE_REQUIRED":
   throw new PrivateLearnerReportError(403,"UPGRADE_REQUIRED","The current plan cannot save private reports");
  case "FORBIDDEN":throw new PrivateLearnerReportError(403,"FORBIDDEN","Private report not accessible");
  default:throw unavailable();
 }
}
function params(input:Scope){
 try{validateReportRange(input.from,input.to);}
 catch{throw new PrivateLearnerReportError(400,"VALIDATION_ERROR","Choose a valid report date range");}
 return {p_student:input.studentId,p_workplace:input.workplaceId,p_from:input.from,p_to:input.to,p_locale:input.outputLocale};
}
async function parsed<T extends z.ZodType>(expected:T,
 result:PromiseLike<{data:unknown;error:{message:string;code?:string}|null}>):Promise<z.infer<T>>{
 const {data,error}=await result;
 if(error)failure(error);
 const value=expected.safeParse(data);
 if(!value.success)throw unavailable();
 return value.data;
}
export async function reviewPrivateLearnerReport(db:SupabaseClient,input:Scope){
 return parsed(bound,db.rpc("ccp_private_report_review",params(input)));
}
export async function savePrivateLearnerReport(db:SupabaseClient,input:PrivateLearnerReportSave){
 return parsed(receipt,db.rpc("ccp_private_report_seal",{
  ...params(input),p_review_digest:input.reviewDigest,p_request_id:input.requestId,p_confirmed:input.confirmed,
 }));
}
const dbRows=z.array(z.object({
 id:z.string().uuid(),workplace_id:z.string().uuid(),output_locale:z.enum(locales),
 approved_at:z.string().datetime({offset:true}),revoked_at:z.string().nullable(),superseded_by:z.string().uuid().nullable(),
}).strict()).max(31);
export async function listPrivateLearnerReports(db:SupabaseClient,teacherId:string,{studentId}:z.infer<typeof privateLearnerReportListInput>){
 const owned=await db.from("students").select("id").eq("teacher_id",teacherId).eq("id",studentId).maybeSingle();
 if(owned.error)throw unavailable();
 if(!owned.data)throw notFound();
 const result=await db.from("report_publications")
  .select("id,workplace_id,output_locale,approved_at,revoked_at,superseded_by")
  .eq("teacher_id",teacherId).eq("student_id",studentId).like("snapshot_storage_ref","db:report:v1:%")
  .order("approved_at",{ascending:false}).order("id",{ascending:false}).limit(31);
 if(result.error)throw unavailable();
 const rows=dbRows.safeParse(result.data);
 if(!rows.success)throw unavailable();
 const reports:PrivateLearnerReportSummary[]=rows.data.slice(0,30).map(row=>({
  publicationId:row.id,workplaceId:row.workplace_id,outputLocale:row.output_locale,approvedAt:row.approved_at,
  status:row.revoked_at?"revoked":row.superseded_by?"superseded":"sealed",
 }));
 return {reports,truncated:rows.data.length>30};
}
export async function getPrivateLearnerReport(db:SupabaseClient,teacherId:string,
 {studentId,publicationId}:z.infer<typeof privateLearnerReportGetInput>){
 const scope=await db.from("report_publications").select("id").eq("teacher_id",teacherId)
  .eq("student_id",studentId).eq("id",publicationId).maybeSingle();
 if(scope.error)throw unavailable();
 if(!scope.data)throw notFound();
 return parsed(snapshot,db.rpc("ccp_private_report_snapshot_get",{p_publication:publicationId}));
}
