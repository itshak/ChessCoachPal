import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {
 PrivateLearnerReportError,getPrivateLearnerReport,privateLearnerReportCandidate,privateLearnerReportGetInput,
} from "@/lib/server/private-learner-report";

const id=z.string().uuid();
const digest=z.string().regex(/^[0-9a-f]{64}$/);
const revision=z.string().regex(/^[1-9]\d*$/);
const dateTime=z.string().datetime({offset:true});

const approvalCursor=z.object({approvedAt:dateTime,portalGrantId:id}).strict();
export const reportAudienceListInput=privateLearnerReportGetInput.extend({
 approvalsAfter:approvalCursor.optional(),
}).strict();
export const reportAudienceReviewInput=privateLearnerReportGetInput.extend({portalGrantId:id}).strict();
export const reportAudienceApproveInput=reportAudienceReviewInput.extend({
 reviewDigest:digest,requestId:id,confirmed:z.literal(true),
}).strict();
export const reportAudienceWithdrawInput=reportAudienceReviewInput.extend({
 approvalId:id,confirmed:z.literal(true),
}).strict();

const reviewSchema=z.object({
 publicationId:id,snapshotDigest:digest,publicationRevision:revision,portalGrantId:id,grantRevision:revision,
 recipientName:z.string(),learnerName:z.string(),workplaceName:z.string(),expiresAt:dateTime,reviewDigest:digest,
}).strict();
const receiptSchema=z.object({
 publicationId:id,portalGrantId:id,approvalId:id,approvedAt:dateTime,revokedAt:dateTime.nullable(),
}).strict();
const guestSchema=z.object({
 reports:z.array(privateLearnerReportCandidate).max(30),truncated:z.boolean(),
}).strict();

export type ReportAudienceReview=z.infer<typeof reviewSchema>;
export type ReportAudienceReceipt=z.infer<typeof receiptSchema>;
type Scope=z.infer<typeof reportAudienceListInput>;
type Review=z.infer<typeof reportAudienceReviewInput>;
type Approve=z.infer<typeof reportAudienceApproveInput>;
type Withdraw=z.infer<typeof reportAudienceWithdrawInput>;

const unavailable=()=>new PrivateLearnerReportError(503,"DATABASE_ERROR","Report access unavailable");
const notFound=()=>new PrivateLearnerReportError(404,"NOT_FOUND","Report or audience not found");
function failure(error:{message:string}):never{
 switch(error.message){
  case "REPORT_AUDIENCE_NOT_FOUND":throw notFound();
  case "REPORT_AUDIENCE_APPROVAL_REQUIRED": case "REPORT_AUDIENCE_WITHDRAWAL_REQUIRED":
   throw new PrivateLearnerReportError(400,"VALIDATION_ERROR","Confirm the exact report access action");
  case "REPORT_AUDIENCE_REVIEW_STALE":
   throw new PrivateLearnerReportError(409,"REPORT_AUDIENCE_REVIEW_STALE","Review the changed report or recipient");
  case "REPORT_AUDIENCE_IDEMPOTENCY_CONFLICT":
   throw new PrivateLearnerReportError(409,"IDEMPOTENCY_CONFLICT","This approval key already has different details");
  case "REPORT_AUDIENCE_ALREADY_REVIEWED":
   throw new PrivateLearnerReportError(409,"REPORT_AUDIENCE_ALREADY_REVIEWED","This report and portal grant have already been reviewed");
  case "UPGRADE_REQUIRED":
   throw new PrivateLearnerReportError(403,"UPGRADE_REQUIRED","The current plan cannot approve report access");
  case "FORBIDDEN":throw new PrivateLearnerReportError(403,"FORBIDDEN","Report access not available");
  default:throw unavailable();
 }
}
async function parsed<T extends z.ZodType>(expected:T,
 result:PromiseLike<{data:unknown;error:{message:string}|null}>):Promise<z.infer<T>>{
 const {data,error}=await result;
 if(error)failure(error);
 const value=expected.safeParse(data);
 if(!value.success)throw unavailable();
 return value.data;
}
async function scopedPublication(db:SupabaseClient,teacherId:string,input:Scope){
 const result=await db.from("report_publications").select("id,workplace_id,revoked_at,superseded_by")
  .eq("teacher_id",teacherId).eq("student_id",input.studentId).eq("id",input.publicationId)
  .eq("snapshot_storage_ref","db:report:v1:"+input.publicationId).maybeSingle();
 if(result.error)throw unavailable();
 if(!result.data)throw notFound();
 return result.data;
}
export async function reviewReportAudience(db:SupabaseClient,teacherId:string,input:Review){
 await scopedPublication(db,teacherId,input);
 return parsed(reviewSchema,db.rpc("ccp_report_audience_review",{
  p_report:input.publicationId,p_grant:input.portalGrantId,
 }));
}
export async function approveReportAudience(db:SupabaseClient,teacherId:string,input:Approve){
 await scopedPublication(db,teacherId,input);
 return parsed(receiptSchema,db.rpc("ccp_report_audience_approve",{
  p_report:input.publicationId,p_grant:input.portalGrantId,p_review_digest:input.reviewDigest,
  p_request:input.requestId,p_confirm:input.confirmed,
 }));
}
export async function withdrawReportAudience(db:SupabaseClient,teacherId:string,input:Withdraw){
 await scopedPublication(db,teacherId,input);
 return parsed(receiptSchema,db.rpc("ccp_report_audience_withdraw",{
  p_report:input.publicationId,p_grant:input.portalGrantId,p_approval:input.approvalId,
  p_confirm:input.confirmed,
 }));
}

export type ReportAudienceOverview={
 choices:{portalGrantId:string;recipientName:string;expiresAt:string}[];
 approvals:(ReportAudienceReceipt&{recipientName:string|null})[];
 choicesTruncated:boolean;nextApprovalCursor:z.infer<typeof approvalCursor>|null;
};
export async function listReportAudience(db:SupabaseClient,teacherId:string,input:Scope):Promise<ReportAudienceOverview>{
 const pub=await scopedPublication(db,teacherId,input);
 // Independently validates that the exact owned reference resolves to a
 // sealed v1 payload. No candidate or provenance is returned by this list.
 const report=await getPrivateLearnerReport(db,teacherId,input);
 let oldQuery=db.from("report_publication_audiences")
  .select("portal_grant_id,request_id,approved_at,revoked_at").eq("teacher_id",teacherId)
  .eq("publication_id",input.publicationId).not("approved_grant_binding","is",null)
  .order("approved_at",{ascending:false}).order("portal_grant_id",{ascending:false}).limit(31);
 const cursor=input.approvalsAfter;
 if(cursor){
  // The two interpolated values are an exact ISO datetime and UUID from
  // the same strict website/MCP schema; the order uses the immutable pair.
  oldQuery=oldQuery.or(`approved_at.lt."${cursor.approvedAt}",and(approved_at.eq."${cursor.approvedAt}",portal_grant_id.lt.${cursor.portalGrantId})`);
 }
 const old=await oldQuery;
 if(old.error)throw unavailable();
 const approvals=(old.data??[]).slice(0,30);
 const approvedIds=approvals.map(x=>x.portal_grant_id as string);
 const grantBase=()=>db.from("portal_access_grants").select("id,contact_id,expires_at")
  .eq("teacher_id",teacherId).eq("student_id",input.studentId).eq("workplace_id",pub.workplace_id);
 const [eligible,previous]=await Promise.all([
  report.status==="sealed"&&!cursor
   ? grantBase().contains("permissions",["shared_notes"])
      .is("revoked_at",null).not("issued_at","is",null)
      .gt("expires_at",new Date().toISOString()).order("issued_at",{ascending:false})
      .order("id",{ascending:false}).limit(31)
   : Promise.resolve({data:[],error:null}),
  approvedIds.length?grantBase().in("id",approvedIds):Promise.resolve({data:[],error:null}),
 ]);
 if(eligible.error||previous.error)throw unavailable();
 const offeredIds=(eligible.data??[]).map(row=>String(row.id));
 const already=offeredIds.length?await db.from("report_publication_audiences").select("portal_grant_id")
  .eq("teacher_id",teacherId).eq("publication_id",input.publicationId).in("portal_grant_id",offeredIds)
  :{data:[],error:null};
 if(already.error)throw unavailable();
 const used=new Set((already.data??[]).map(row=>String(row.portal_grant_id)));
 const ids=[...new Set([...(eligible.data??[]),...(previous.data??[])].map(row=>String(row.contact_id)))];
 const names=ids.length?await db.from("contacts").select("id,display_name,status")
  .eq("teacher_id",teacherId).in("id",ids):{data:[],error:null};
 if(names.error)throw unavailable();
 const contactById=new Map((names.data??[]).map(row=>[String(row.id),row]));
 const grantById=new Map((previous.data??[]).map(row=>[String(row.id),row]));
 const choices=(eligible.data??[]).flatMap(row=>{
  const contact=contactById.get(String(row.contact_id));
  return !used.has(String(row.id))&&contact?.status==="active"
    ? [{portalGrantId:String(row.id),recipientName:String(contact.display_name),expiresAt:String(row.expires_at)}]:[];
 });
 // A choice still requires independent exact-scope review: being listed does
 // not attest current consent/enrollment or make a report guest-visible.
 const last=approvals.at(-1);
 const nextApprovalCursor=(old.data?.length??0)>30&&last
  ? {approvedAt:String(last.approved_at),portalGrantId:String(last.portal_grant_id)}:null;
 return {choices:choices.slice(0,30),choicesTruncated:(eligible.data?.length??0)>30,
  approvals:approvals.map(row=>{
   const grant=grantById.get(String(row.portal_grant_id)),contact=grant&&contactById.get(String(grant.contact_id));
   return {publicationId:input.publicationId,portalGrantId:String(row.portal_grant_id),
    approvalId:String(row.request_id),approvedAt:String(row.approved_at),
    revokedAt:row.revoked_at?String(row.revoked_at):null,recipientName:contact?String(contact.display_name):null};
  }),nextApprovalCursor};
}

/** Only the server portal may call this; the caller passes no tenant or report ID. */
export async function portalSealedLearnerReports(db:SupabaseClient,token:string){
 try{
  if(!/^[A-Za-z0-9_-]{42,44}$/.test(token))return null;
  return await parsed(guestSchema,db.rpc("ccp_portal_sealed_learner_reports",{p_secret:token}));
 }catch{return null;}
}
