import "server-only";
import { z } from "zod";
import {spreadsheetSuggestMcpSchema} from "@/lib/spreadsheet-suggest";
import {invoiceDraftEditSchema} from "@/lib/server/invoice-draft-schemas";
import {eventChanges} from "@/lib/server/teacher-event-schemas";
import {manualPaymentMcpSchema} from "@/lib/server/manual-payment-schemas";
import { lichessConnectionStatus,lichessConnectionHandoff,disconnectLichess,LichessConnectionError } from "@/lib/server/lichess-connections";
import {teacherLichessStudiesSearch} from "@/lib/server/lichess-studies";
import {puzzleDraftSchema,puzzlePublishSchema} from "@/lib/lichess-puzzles";
import {teacherLichessPuzzlePreview,teacherLichessPuzzlePublish,LichessPuzzleError} from "@/lib/server/lichess-puzzles";
import {teacherImageFenPropose,imageFenInputSchema,ImageFenError} from "@/lib/server/teacher-image-fen";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CoachError, attendanceList, attendanceRecord, groupsList, groupsMembers,
  sessionsList, sessionsParticipants, sessionsAdHocCreate, sessionsUpdate, sessionsComplete, studentsSearch, workplacesList, workplacesEnrollments, workplacesUnenroll,
} from "@/lib/server/coach-service";

import {
  teacherSessionRosterPreview,teacherSessionRosterCorrect,teacherSessionRosterAudit,
  SessionRosterCorrectionError,
} from "@/lib/server/session-roster-corrections";
import { chessCategoriesList, chessCategoriesCreate, chessCategoriesUpdate,
  chessCategoriesDeleteImpact, chessCategoriesDelete,
  chessObservationsList, chessObservationsCreate, chessObservationsUpdate,
 } from "@/lib/server/chess-learning";
import {materialLinksList,materialLinksCreate,materialLinksUpdate,
 materialLinksUnlinkImpact,materialLinksUnlink} from "@/lib/server/material-links";
import { chessUuid, categoryName, observationText, observedAt, observationInput,
 materialLinkListInput,materialLinkCreateInput,materialLinkUpdateInput,materialLinkUnlinkInput,
} from "@/lib/chess-learning";
import {lessonCompletionSchema,type LessonCompletionInput} from "@/lib/lesson-completion";
import {materialsHistoryFilter,materialsHistoryRecord,materialsHistoryVoid,teacherMaterialHistory,teacherMaterialAggregate,teacherMaterialRecord,teacherMaterialVoid,MaterialHistoryError} from "@/lib/server/teacher-material-history";
import {materialCatalogCreateSchema,materialCatalogUpdateSchema,materialCatalogFilterSchema,materialRelationListSchema,materialRelationSchema,materialArchivePreviewSchema,materialLifecycleSchema,teacherMaterialCatalogCreate,teacherMaterialCatalogUpdate,teacherMaterialCatalogGet,teacherMaterialCatalogList,teacherMaterialRelationsList,teacherMaterialRelationChange,teacherMaterialArchivePreview,teacherMaterialLifecycleChange,MaterialCatalogError} from "@/lib/server/learning-materials";
import {assignmentListSchema,assignmentCreateSchema,assignmentAttemptSchema,assignmentReviewSchema,teacherAssignmentsList,teacherAssignmentsCreate,teacherAssignmentAttempt,teacherAssignmentReview,AssignmentServiceError} from "@/lib/server/training-assignments";
import {
 defaultCreateSchema,defaultUpdateSchema,defaultUpdateToolSchema,defaultArchiveSchema,
 teacherMaterialDefaultsList,teacherMaterialDefaultCreate,
 teacherMaterialDefaultUpdate,teacherMaterialDefaultArchive,MaterialDefaultError,
} from "@/lib/server/teacher-material-defaults";
import { reportCsv, reportText } from "@/lib/coaching-report";
import {unifiedLessonFilter,teacherUnifiedLessonHistory,UnifiedHistoryError} from "@/lib/server/unified-lesson-service";
import {coachBriefingSchema,teacherCoachBriefing,CoachBriefingError} from "@/lib/server/coach-briefing";
import {trainingPlanListSchema,trainingPlanGetSchema,trainingPlanCommitSchema,teacherTrainingPlansList,teacherTrainingPlanGet,teacherTrainingPlanCommit,TrainingPlanError} from "@/lib/server/student-training-plans";
import { ReportServiceError, workplaceTeachingReport } from "@/lib/server/coaching-report-service";
import {teacherCalendarFeedStatus,teacherCalendarFeedRotate,CalendarFeedTokenError} from "@/lib/server/teacher-calendar-feed-service";
import {teacherProfileGet,teacherProfileUpdate,TeacherProfileError} from "@/lib/server/teacher-profile-service";
import {teacherInvoiceSendPreview,InvoiceSendPreviewError} from "@/lib/server/teacher-invoice-send-preview";
import {teacherStudentProgressReport} from "@/lib/server/teacher-student-progress-service";
import { teacherDashboardSummary, teacherNotificationsList, teacherNotificationsMarkRead,
  TeacherOverviewError } from "@/lib/server/teacher-overview-service";

import { teacherStudentProfile, teacherStudentsRoster, teacherStudentPatch, teacherStudentChessHistory, teacherStudentArchivePreview, teacherStudentDeleteImpact, teacherStudentDelete, StudentProfileError } from "@/lib/server/student-profile-service";
import { studentUpdateSchema,studentCreateSchema } from "@/lib/server/api-schemas";
import { createStudentWithOptionalFamily } from "@/lib/server/families";
const safeStudentProfile = (row: Record<string,unknown>) => ({
  id:row.id,name:row.name,name_aliases:row.name_aliases,level:row.level,
  strength:row.strength,lichess_username:row.lichess_username,chesscom_username:row.chesscom_username,
  lichess_rating:row.lichess_rating,chesscom_rating:row.chesscom_rating,
  chess_goals:row.chess_goals,chess_ratings:row.chess_ratings,
  archived_at:row.archived_at,updated_at:row.updated_at,
});
import {
 skillDimensionsList, skillDimensionsCreate, skillDimensionsUpdate, skillDimensionsDeleteImpact, skillDimensionsDelete,
 studentSkillAssessmentsList, studentSkillAssessmentsRecord, TeacherSkillsError,
} from "@/lib/server/teacher-skills-service";
import { guardianCreateSchema, guardianUpdateSchema } from "@/lib/server/api-schemas";
import { guardiansList, guardianDetail, guardianCreate, guardianUpdate,
 guardianDeleteImpact, guardianDelete, guardianRotatePortalToken, safeGuardian,
 GuardianServiceError,
} from "@/lib/server/teacher-guardian-service";
import {
 calendarSlotsList,calendarSlotCreate,calendarSlotUpdate,calendarSlotDelete,
 calendarLessonsList,calendarLessonDetail,calendarLessonCreate,calendarLessonUpdate,
 calendarLessonDelete,CalendarError,
} from "@/lib/server/legacy-calendar-service";
import {
 calendarAttendanceRead,calendarAttendanceWrite,calendarAttendanceBulk,
 calendarLessonNoteRead,calendarLessonNoteWrite,LegacyAttendanceError,
} from "@/lib/server/legacy-attendance-service";
import { oauthOrigin } from "@/lib/server/agent-oauth-core";
import { teacherPolicyView, teacherPolicyUpdate } from "@/lib/server/teacher-policy-service";
import {
 teacherEventsList,teacherEventDetail,teacherEventCreate,teacherEventUpdate,
 teacherEventDeleteImpact,teacherEventDelete,teacherEventInviteEmail,teacherEventInvitePreview,TeacherEventError,
} from "@/lib/server/teacher-events-service";
import {
 teacherInvoicesList,teacherInvoiceDetail,safeInvoice,teacherPaymentsExport,TeacherBillingError,
} from "@/lib/server/teacher-billing-read-service";
import {
 teacherInvoiceDelete,teacherInvoiceVoid,teacherInvoiceDraftUpdate,teacherInvoiceSend,InvoiceActionError,
} from "@/lib/server/teacher-invoice-actions";
import {teacherConnectionsList,teacherConnectionRevoke,ConnectionError} from "@/lib/server/teacher-connections-service";
import {creditPackageCreateSchema} from "@/lib/server/api-schemas";
import {
 teacherCreditPackagesList,teacherCreditPackageCreate,teacherCreditPackageExpiry,
 teacherCreditRedemptionReturn,CreditServiceError,
} from "@/lib/server/teacher-credit-service";
import {teacherManualPaymentRecord,teacherManualPaymentDelete,ManualPaymentError} from "@/lib/server/teacher-manual-payments";
import {
 teacherSafeExport,teacherImportPreview,teacherImportApply,TeacherTransferError,
} from "@/lib/server/teacher-transfer-service";
import {
 teacherSpreadsheetParse,teacherSpreadsheetPreview,teacherSpreadsheetSuggest,
 teacherSpreadsheetCommit,SpreadsheetImportError,MAX_SPREADSHEET_BYTES,
} from "@/lib/server/teacher-spreadsheet-import";
import type {ColumnMapping} from "@/lib/spreadsheet-import";
import {
 teacherBillingGenerate,teacherBillingRegenerate,teacherBillingCheckout,teacherBillingBulk,
 teacherBillingBulkPreview,
} from "@/lib/server/teacher-billing-operations";
import {loadInvoicePdf} from "@/lib/server/invoice-pdf-data";
import {invoicePdfMcpPayload} from "@/lib/server/invoice-pdf-transfer";
async function billingActionResponse(result:Response){
 const body=await result.json();
 return result.ok?{data:body}:{error:{code:result.status===400?"VALIDATION_ERROR":
  result.status===404?"NOT_FOUND":result.status===409?"CONFLICT":"BILLING_ERROR",
  message:body.error??"Billing action failed"}};
}
const uuid = z.string().uuid();
const studioPolicyPatch=z.object({
 studioName:z.string().max(120).optional(),
 studioWebsite:z.string().max(300).optional(),
 studioContact:z.string().max(300).optional(),
 studioInfo:z.string().max(5000).optional(),
 lessonLabel:z.string().max(60).optional(),
 lessonDurationOptions:z.array(z.number().int().min(5).max(240)).min(1).max(20).optional(),
 timezone:z.string().max(100).optional(),
 cancellationWindowHours:z.number().min(0).max(8760).optional(),
 timelyCancelEarnsMakeup:z.boolean().optional(),
 lateCancelEarnsMakeup:z.boolean().optional(),
 noShowEarnsMakeup:z.boolean().optional(),
 teacherCancelEarnsMakeup:z.boolean().optional(),
 makeupCreditExpiryDays:z.number().int().min(0).max(3650).nullable().optional(),
 billAttended:z.boolean().optional(),billNoShow:z.boolean().optional(),
 billTeacherCancel:z.boolean().optional(),
 billTimelyStudentCancel:z.boolean().optional(),billLateStudentCancel:z.boolean().optional(),
 billMakeup:z.boolean().optional(),
 defaultRateCents:z.number().int().min(0).max(10000000).nullable().optional(),
 travelFeeCents:z.number().int().min(0).max(10000000).nullable().optional(),
 durationRateCents:z.record(z.string(),z.number().int().min(0).max(10000000)).optional(),
 rateBasis:z.enum(["per_lesson","per_hour"]).optional(),
 currency:z.string().trim().min(3).max(3).optional(),
 invoiceCadence:z.enum(["monthly","manual"]).optional(),
 paymentInstructions:z.string().max(2000).optional(),
 paymentProvider:z.enum(["manual","stripe"]).optional(),
 // The payment QR is ordinary coach-owned data, not a Stripe credential.
 // Validate format and 400 KB size in the shared website domain service.
 paymentQrCode:z.string().max(400_000).nullable().optional(),
 clearStripeSecretKey:z.literal(true).optional(),
 clearStripePublishableKey:z.literal(true).optional(),
 clearStripeWebhookSecret:z.literal(true).optional(),
 notifyInApp:z.boolean().optional(),
 notifyEmailPortalCancel:z.boolean().optional(),
 notifyEmailInvoicePaid:z.boolean().optional(),
 bccFamilyEmails:z.boolean().optional(),
 bccEmail:z.string().max(320).nullable().optional(),
 // Model may select an existing provider or clear a stored key, but may never
 // submit/read raw BYO secrets; entering replacement credentials stays in
 // the signed-in website's secure settings flow.
 aiProvider:z.enum(["none","openai","anthropic"]).optional(),
 clearAiApiKey:z.literal(true).optional(),
}).strict();

const searchText = z.string().trim().min(1).max(80);
const sessionId = z.object({ sessionId: uuid }).strict();
const shortName = z.string().trim().min(1).max(120);
const instant = z.string().datetime({offset:true});
const mutation = {idempotencyKey:uuid};
const revision = {...mutation,expectedUpdatedAt:instant};
const resourcePolicy = z.record(z.string(),z.unknown());
const locale = z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);
const currency = z.string().regex(/^[A-Z]{3}$/);

const catalogue = [
  {
    name: "ccp_v1_workplaces_list",
    description: "List the connected teacher's workplaces. Use workplace IDs, never invent names.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_dashboard_summary",
    description: "Read the same teacher-owned student/workplace/group and last-seven-day session totals as the website dashboard.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_notifications_list",
    description: "Read the 30 most recent teacher notifications and unread count, exactly as on the website.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_notifications_mark_read",
    description: "Mark a specific notification ID or all of the teacher's unread notifications as read. Confirm before modifying notification state.",
    schema: z.object({
      id: uuid.optional(), all: z.literal(true).optional(),
    }).strict().refine(v => v.all === true || !!v.id, "id or all required"),
    scope: "coach:write", readOnly: false,
  },
  {
    name:"ccp_v1_lessons_history_unified",
    description:"Read one bounded calendar period across historic private lessons and current coaching/group sessions. Preserves both sources, flags exact overlaps, and computes instructor booked vs actually evidenced minutes as interval unions (groups count once); legacy workplace attribution is unknown rather than guessed. Optional student/workplace filters.",
    schema:unifiedLessonFilter,
    scope:"coach:read",readOnly:true,
  },
  {
    name: "ccp_v1_reports_workplace_summary",
    description: "Read a teacher-owned workplace's date-range sessions and attendance totals, with optional CSV or text export. The same server calculation powers the website. Instructor minutes count each group lesson once. No student names or notes in this aggregate.",
    schema: z.object({
      workplaceId: uuid,
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      format: z.enum(["json", "csv", "text"]).default("json"),
    }).strict(),
    scope: "coach:read", readOnly: true,
  },
  {
    name:"ccp_v1_billing_generation_preview",
    description:"Preview billable lesson charges, travel fees and prepaid-credit impact for one date period without creating invoices. Review totals and missing-rate warnings before commit.",
    schema:z.object({periodStart:z.string().date(),periodEnd:z.string().date()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_billing_generation_commit",
    description:"Generate draft invoices and consume eligible prepaid credits in one transaction. Explicit confirmation required. Supply and reuse idempotencyKey on website/MCP retries to get the same immutable invoice IDs without recharging credits.",
    schema:z.object({periodStart:z.string().date(),periodEnd:z.string().date(),
      confirmed:z.literal(true),idempotencyKey:uuid.optional()}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoice_regenerate",
    description:"Recalculate a draft invoice from attendance, rates and credits with a database transaction, optimistic revision and immutable retry receipt. Review the current invoice first and reuse expectedUpdatedAt plus idempotencyKey across retries. Explicit confirmation required.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true),
      expectedUpdatedAt:z.string().datetime({offset:true}).optional(),
      idempotencyKey:uuid.optional()}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoice_pdf",
    description:"Generate an owned invoice PDF in base64 without sending it. Requires teacher confirmation because invoice PDFs can contain family personal information. For large files use secure website download.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_billing_invoice_checkout",
    description:"After explicit teacher approval, initiate a Stripe checkout link for the remaining balance on one invoice. Never charge a card directly; the family completes payment securely in Stripe's browser checkout.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true),
      confirmedExternal:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoices_bulk_preview",
    description:"Review up to 50 teacher-owned draft invoices with current amounts, email recipients and a revision fingerprint. Requires confirmed=true to reveal family emails. Read-only; no email is sent.",
    schema:z.object({ids:z.array(uuid).min(1).max(50),
      includeRecipients:z.boolean().default(false),confirmed:z.literal(true).optional()}).strict()
      .refine(v=>!v.includeRecipients||v.confirmed===true,
        "Viewing family recipients requires explicit approval"),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_billing_invoices_bulk",
    description:"Perform confirmed invoice send, delete or void on up to 50 teacher-owned invoices. For SEND first review the bulk preview of all recipients and totals, then provide its previewDigest plus confirmedEmail=true and confirmed=true. Changed recipients reject sending.",
    schema:z.object({ids:z.array(uuid).min(1).max(50),
      action:z.enum(["send","delete","void"]),
      confirmed:z.literal(true),confirmedEmail:z.literal(true).optional(),
      previewDigest:z.string().regex(/^[0-9a-f]{64}$/).optional()}).strict()
      .refine(v=>v.action!=="send"||
        (v.confirmedEmail===true&&Boolean(v.previewDigest)),
        "Bulk email requires confirmed recipient preview"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_import_spreadsheet_parse",
    description:"Parse a teacher-supplied CSV/XLSX spreadsheet provided as base64 without writing data. Return proposed mapping and a preview. Max file size 2 MB.",
    schema:z.object({filename:z.string().trim().min(1).max(120),
      base64:z.string().min(1).max(3000000)}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_import_spreadsheet_preview",
    description:"Preview normalized student/family import rows using a selected column mapping before any database mutations.",
    schema:z.object({rows:z.array(z.record(z.string(),z.string())).max(500),
      mapping:z.record(z.string(),z.string().nullable())}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_import_spreadsheet_suggest",
    description:"Suggest source-header column mapping. Local deterministic heuristic by default; AI provider requires useAi=true and confirmedExternal=true because sample data is shared with the configured external AI.",
    schema:spreadsheetSuggestMcpSchema,
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_import_spreadsheet_commit",
    description:"Atomically import up to 500 reviewed student/family rows with explicit approval and idempotent receipts. A failed batch rolls back all student and family writes. Archived names are deduplicated.",
    schema:z.object({rows:z.array(z.record(z.string(),z.string())).min(1).max(500),
      mapping:z.record(z.string(),z.string().nullable()),confirmed:z.literal(true),
      idempotencyKey:uuid.optional()}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_settings_export",
    description:"Export teacher-owned chess academy data as portable JSON after explicit approval. Guardian portal credentials and provider secrets are NOT returned. Large backups require a secure browser download.",
    schema:z.object({confirmed:z.literal(true)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_settings_import_preview",
    description:"Preview a ChessCoachPal export without writing any data. Returns SHA-256, table counts, size and warnings. Review before any import.",
    schema:z.object({payload:z.unknown()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_settings_import_apply",
    description:"High-impact merge import into the teacher account. Require explicit confirmation and the exact SHA-256 digest from a reviewed preview. Existing records with matching IDs may be modified and some guardian portal links rotated.",
    schema:z.object({payload:z.unknown(),
      expectedSha256:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_manual_payment_record",
    description:"Record an actual payment already received outside ChessCoachPal against a teacher-owned invoice. This tool does not charge a card. Use a new idempotencyKey per real-world payment, reuse it on retries, verify invoice balance first and require explicit teacher confirmation.",
    schema:manualPaymentMcpSchema.extend({invoiceId:uuid}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_manual_payment_delete",
    description:"Remove a mistakenly recorded manual payment from one identified owned invoice after explicit confirmation. A Stripe payment requires refund on the provider, not deletion.",
    schema:z.object({invoiceId:uuid,paymentId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_credits_packages_list",
    description:"Read prepaid packages, redeemed/pending balances, invoice status and expiration for an identified student or all coach-owned students.",
    schema:z.object({studentId:uuid.optional()}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_credits_package_create",
    description:"Sell a confirmed set of prepaid lesson credits by creating a draft invoice linked to an owned student and family. No payment or email is sent by this tool.",
    schema:creditPackageCreateSchema.extend({confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_credits_package_expiry",
    description:"Change or clear the expiry of an owned prepaid package, never before its start or dates of already redeemed lessons.",
    schema:z.object({packageId:uuid,expiresOn:z.string().date().nullable(),
      confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_credits_redemption_return",
    description:"Return one identified used lesson credit to its prepaid package; changes what can be billed next. Teacher confirmation required.",
    schema:z.object({redemptionId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_connections_list",
    description:"List active authorized AI connector grants (client ID, scopes and timestamp only). Never reveal OAuth tokens or stored provider secrets.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_connections_revoke",
    description:"After explicit confirmation, immediately revoke one identified OAuth grant, possibly this very connection. The grant loses access to all MCP tools and token refresh.",
    schema:z.object({connectionId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoice_draft_update",
    description:"Atomically edit draft invoice lines and notes through a tenant-locked SQL transaction. Supply optional expectedUpdatedAt and immutable idempotencyKey for safe website↔MCP retries; changed payload or stale revision conflicts. Explicit teacher approval required.",
    schema:z.object({invoiceId:uuid,changes:invoiceDraftEditSchema,
      confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoice_void",
    description:"Atomically void an owned draft/sent invoice after confirmed teacher review. A request UUID supports cross-client replay; reject paid/partially paid invoices, active Stripe checkout, or issued prepaid credits instead of silently erasing value.",
    schema:z.object({invoiceId:uuid,idempotencyKey:uuid.optional(),
      confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoice_delete",
    description:"Permanently delete one identified draft or void invoice after confirmation. Never remove paid/sent invoice history.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoice_send_preview",
    description:"Non-mutating preview of an owned draft invoice: PDF readiness, amount, recipient count, subject and content summary. includeRecipients=true requires confirmed=true; never reveal portal tokens or Stripe URLs.",
    schema:z.object({invoiceId:uuid,includeRecipients:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict()
      .refine(a=>!a.includeRecipients||a.confirmed===true,"Email addresses require confirmation"),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_billing_invoice_send",
    description:"Email an existing draft invoice PDF and mark it sent, optionally creating a Stripe checkout link. Requires explicit approval for the external email and financial impact; never silently send/retry.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true),confirmedEmail:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoices_list",
    description:"List scoped invoices and their balances for this teacher, paginated. No portal tokens, checkout URLs or family email addresses.",
    schema:z.object({status:z.enum(["draft","sent","paid","void"]).optional(),
      offset:z.number().int().min(0).max(100000).default(0),
      limit:z.number().int().min(1).max(100).default(50)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_billing_invoice_detail",
    description:"Read one owned invoice with item and payment history. Family contacts and payment notes require includePrivate=true plus confirmation; portal tokens and Stripe secrets never returned.",
    schema:z.object({invoiceId:uuid,includePrivate:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_billing_payments_export",
    description:"Export accountant-facing CSV of teacher-owned payments in an optional YYYY-MM-DD period, including family names and payment notes. Requires explicit teacher confirmation; safely escapes CSV formulas.",
    schema:z.object({from:z.string().date().optional(),to:z.string().date().optional(),
      confirmed:z.literal(true)}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_studio_policy_get",
    description:"Read teacher-owned studio rules, rates and billing settings with secrets redacted. Payment QR image bytes require includePaymentQrCode=true and explicit confirmation; Stripe credentials are never returned.",
    schema:z.object({
      includePaymentQrCode:z.boolean().default(false),
      confirmed:z.literal(true).optional(),
    }).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_studio_credentials_handoff",
    description:"Start secure browser-only AI or Stripe credential entry without submitting any secret through the model. Returns the authenticated setup URL and current configured status; all raw keys must be entered directly into the website. Explicit teacher confirmation required.",
    schema:z.object({kind:z.enum(["ai","stripe"]),confirmed:z.literal(true)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_studio_policy_update",
    description:"Edit studio rates, payment provider, approved payment QR and optional AI provider, or clear stored credentials with confirmation. New API keys and Stripe secrets remain browser-only secure inputs, never accepted through MCP.",
    schema:z.object({changes:studioPolicyPatch,confirmed:z.literal(true)}).strict()
      .refine(v=>Object.keys(v.changes).length>0,"Changes required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_events_list",
    description:"List teacher-owned class events and RSVP aggregates without exposing family contact details or tokens.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_events_detail",
    description:"Read an identified event and student roster; family RSVP notes require includeRsvps=true and explicit confirmation.",
    schema:z.object({eventId:uuid,includeRsvps:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_events_create",
    description:"Create an event for named students, with optional student repertoires, pending RSVPs and atomic idempotencyKey replay across website/MCP. DOES NOT email without a separate confirmed send tool.",
    schema:eventChanges.extend({title:z.string().trim().min(1).max(200),
      startsAt:z.string().datetime({offset:true}),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_events_update",
    description:"Edit an event and optionally REPLACE the whole student roster. Get the current event first, then explicitly confirm changed students and dates.",
    schema:eventChanges.extend({eventId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_events_delete_impact",
    description:"Preview an event's student roster and RSVPs before permanent deletion.",
    schema:z.object({eventId:uuid}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_events_delete",
    description:"Permanently delete an event and associated RSVP records only after explicit teacher confirmation.",
    schema:z.object({eventId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_reports_student_progress",
    description:"Read factual teacher-attested student progress: 1–10 strength, optional chess platform ratings, latest skill assessments with assessment counts, and full non-voided material evidence coverage. No inferred mastery or guardian/private notes.",
    schema:z.object({studentId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_account_security_handoff",
    description:"Open the signed-in website to change login email, password or multi-factor authentication using provider-secured reauthentication. MCP never sees credentials, recovery codes or MFA secrets.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_hosted_subscription_handoff",
    description:"Open the signed-in Account page to review hosting plan, start subscription Checkout or enter Stripe billing portal securely in the browser. MCP cannot collect card data or create a Stripe session without the required browser confirmation.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_teacher_profile_get",
    description:"Read this coach's display name and public avatar reference without authentication credentials or account email.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_teacher_profile_update",
    description:"Update the coach's display name or their own approved avatar URL after explicit confirmation. Password, login email and MFA are website-only secured account operations.",
    schema:z.object({
      displayName:z.string().trim().min(1).max(200).optional(),
      avatarUrl:z.string().url().max(2048).nullable().optional(),
      confirmed:z.literal(true),
    }).strict().refine(a=>a.displayName!==undefined||a.avatarUrl!==undefined,"No profile changes"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_feed_status",
    description:"Check whether this teacher has an active calendar feed. Never returns the bearer link or token.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_calendar_feed_rotate",
    description:"After explicit teacher confirmation, revoke the old calendar feed and generate a new link. The old link immediately stops working. The new secret is only available to the signed-in website, never to MCP.",
    schema:z.object({confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_events_email_preview",
    description:"Preview exactly the event invitation subject/body and intended recipient counts, with no email sent. Add includeRecipients=true plus confirmed=true to reveal addresses. Never returns family portal tokens or URLs.",
    schema:z.object({eventId:uuid,includeRecipients:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict()
      .refine(a=>!a.includeRecipients||a.confirmed===true,
        "Recipient contact details require explicit confirmation"),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_events_email_invites",
    description:"Explicit external action: email event invitations to participating families. Requires confirmation; no automatic emails on create or edit.",
    schema:z.object({eventId:uuid,confirmed:z.literal(true),confirmedEmail:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_attendance_read",
    description:"Read an identified private lesson's recorded attendance and cancellation notice.",
    schema:z.object({lessonId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_calendar_attendance_record",
    description:"Write one private-calendar attendance decision through a teacher-locked, revision-checked SQL transaction. For safe cross-interface replay supply expectedMarkedAt (null if unmarked) AND idempotencyKey; changed-payload reuse or stale revisions conflict. Student cancellation replay needs explicit noticeAt. Family notification requires teacher_cancel plus notifyFamily=true and confirmedEmail=true; default is no email.",
    schema:z.object({lessonId:uuid,
      status:z.enum(["attended","teacher_cancel","student_cancel","no_show"]).nullable(),
      noticeChoice:z.enum(["now","timely","late","custom"]).optional(),
      noticeAt:z.string().datetime({offset:true}).nullable().optional(),
      cancelNote:z.string().max(1000).optional(),
      expectedMarkedAt:z.string().datetime({offset:true}).nullable().optional(),
      idempotencyKey:uuid.optional(),
      notifyFamily:z.boolean().default(false),confirmedEmail:z.literal(true).optional(),
      confirmed:z.literal(true),
    }).strict().refine(v=>!v.notifyFamily||v.confirmedEmail===true,"Email requires explicit confirmation")
      .refine(v=>(v.idempotencyKey===undefined)===(v.expectedMarkedAt===undefined),
       "Revision and idempotency key must be supplied together"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_attendance_bulk",
    description:"Bulk record 1–50 private lesson outcomes using the same revision-checked SQL writer as individual attendance. Optional idempotencyKey and expectedMarkedAtByLesson (every ID mapped to a timestamp or null) make partial retries safe across website/MCP. Per-lesson errors remain explicit. Bulk email requires confirmedEmail=true and is attempted only for newly committed teacher cancellations.",
    schema:z.object({ids:z.array(uuid).min(1).max(50),status:z.enum(["attended","no_show","teacher_cancel"]),
      idempotencyKey:uuid.optional(),
      expectedMarkedAtByLesson:z.record(uuid,z.string().datetime({offset:true}).nullable()).optional(),
      notifyFamily:z.boolean().default(false),confirmedEmail:z.literal(true).optional(),
      confirmed:z.literal(true),
    }).strict().refine(v=>!v.notifyFamily||v.confirmedEmail===true,"Email requires explicit confirmation")
     .refine(v=>(v.idempotencyKey===undefined)===(v.expectedMarkedAtByLesson===undefined),
       "Bulk replay requires one original revision for every lesson"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_lesson_note_read",
    description:"Read a private lesson's student-facing notes. Teacher-private note is redacted unless includePrivate=true and confirmed=true.",
    schema:z.object({lessonId:uuid,includePrivate:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_calendar_lesson_note_update",
    description:"Save one lesson's family-facing and private notes. Email is opt-in, requiring sendEmail=true AND confirmedEmail=true, never a surprise side effect.",
    schema:z.object({lessonId:uuid,body:z.string().max(10000).optional(),
      privateBody:z.string().max(10000).optional(),sendEmail:z.boolean().default(false),
      confirmedEmail:z.literal(true).optional(),confirmed:z.literal(true),
    }).strict().refine(v=>!v.sendEmail||v.confirmedEmail===true,"Email requires explicit confirmation"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_slots_list",
    description:"List existing recurring private-lesson time slots for the authenticated teacher.",
    schema:z.object({studentId:uuid.optional(),activeOnly:z.boolean().optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_calendar_slots_create",
    description:"Create a confirmed private recurring lesson slot and materialize upcoming occurrences in the teacher timezone.",
    schema:z.object({studentId:uuid,dayOfWeek:z.number().int().min(0).max(6),
      startTime:z.string().regex(/^\d{2}:\d{2}$/),durationMinutes:z.number().int().min(1).max(480).optional(),
      startDate:z.string().date().optional(),endDate:z.string().date().nullable().optional(),
      rateCents:z.number().int().min(0).nullable().optional(),isHomeVisit:z.boolean().optional(),
      confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_slots_update",
    description:"Edit a confirmed recurring slot; upcoming unmarked occurrences are synchronized, while marked history and notes are preserved.",
    schema:z.object({slotId:uuid,changes:z.object({
      dayOfWeek:z.number().int().min(0).max(6).optional(),
      startTime:z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
      durationMinutes:z.number().int().min(1).max(480).optional(),
      startDate:z.string().date().optional(),endDate:z.string().date().nullable().optional(),
      rateCents:z.number().int().min(0).nullable().optional(),
      active:z.boolean().optional(),isHomeVisit:z.boolean().optional(),
    }).strict(),confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_slots_delete",
    description:"Permanently remove one recurring slot after explicit confirmation. Unmarked future occurrences can disappear; marked history is retained.",
    schema:z.object({slotId:uuid,confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_lessons_list",
    description:"List dated private lessons with stable IDs and optional student/date filters. These differ from group teaching_sessions.",
    schema:z.object({studentId:uuid.optional(),from:z.string().date().optional(),
      to:z.string().date().optional(),offset:z.number().int().min(0).max(100000).default(0),
      limit:z.number().int().min(1).max(100).default(50)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_calendar_lessons_detail",
    description:"Read one identified private lesson and whether it is already marked.",
    schema:z.object({lessonId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_calendar_lessons_create",
    description:"Create a confirmed private ad-hoc or makeup lesson in the studio timezone, validating makeup credit ownership.",
    schema:z.object({studentId:uuid,date:z.string().date(),
      time:z.string().regex(/^\d{2}:\d{2}$/),durationMinutes:z.number().int().min(1).max(480).optional(),
      makeupFor:uuid.nullable().optional(),isHomeVisit:z.boolean().optional(),
      confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_lessons_update",
    description:"Correct one identified private lesson date, time, duration or home visit after confirmation. Marked lessons cannot be rescheduled.",
    schema:z.object({lessonId:uuid,changes:z.object({
      date:z.string().date().optional(),time:z.string().regex(/^\d{2}:\d{2}$/).optional(),
      durationMinutes:z.number().int().min(1).max(480).optional(),
      isHomeVisit:z.boolean().optional(),
    }).strict(),confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_lessons_delete",
    description:"Permanently delete a confirmed ad-hoc private lesson. Recurring occurrences must be cancelled instead.",
    schema:z.object({lessonId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_guardians_list",
    description:"List teacher-owned families with student names. Contact details and portal credentials are redacted; use an identified detail read and explicit confirmation for contact data.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_guardians_detail",
    description:"Read one identified family. Contact details require includeContacts=true plus confirmed=true; never disclose the portal token.",
    schema:z.object({guardianId:uuid,includeContacts:z.boolean().default(false),confirmed:z.literal(true).optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_guardians_create",
    description:"Create a family, optionally linking existing students or creating named children. Requires explicit teacher confirmation; never return family portal tokens or contact info to the model.",
    schema:guardianCreateSchema.extend({confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_guardians_update",
    description:"Update family contacts, recipient preferences and exact current roster; changing studentIds replaces membership. Require teacher confirmation.",
    schema:guardianUpdateSchema.extend({guardianId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_guardians_delete_impact",
    description:"Preview student and invoice obligations that block family deletion.",
    schema:z.object({guardianId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_guardians_delete",
    description:"Permanently remove an empty family only with explicit approval; student or invoice dependencies block deletion.",
    schema:z.object({guardianId:uuid,confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_guardians_rotate_portal_token",
    description:"Invalidate an existing family-portal link and create a fresh one. Optional requestId safely replays a confirmed rotation across website/MCP retries. New secret is NEVER returned to the model; view the URL securely on the website.",
    schema:z.object({guardianId:uuid,requestId:uuid.optional(),confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_skill_dimensions_list",
    description:"List teacher-owned 1–5 assessment dimensions; the website uses the same chess-specific dimensions.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_skill_dimensions_create",
    description:"Create a teacher-owned skill dimension after teacher approval; avoid duplicates.",
    schema:z.object({name:z.string().trim().min(1).max(120),requestId:uuid.optional(),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_skill_dimensions_update",
    description:"Rename one teacher-owned skill dimension while preserving assessments; confirm the name.",
    schema:z.object({dimensionId:uuid,name:z.string().trim().min(1).max(120),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_skill_dimensions_delete_impact",
    description:"Preview whether a skill dimension is unused and may be removed. Preserve all historic ratings.",
    schema:z.object({dimensionId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_skill_dimensions_delete",
    description:"Delete only an unused dimension with teacher approval and zero-assessment preview; rename used dimensions instead.",
    schema:z.object({dimensionId:uuid,expectedAssessmentCount:z.number().int().min(0),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_lichess_connection_status",
    description:"Read teacher Lichess account username, study scopes and connection status. No provider credentials are accessible.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_lichess_image_fen_propose",
    description:"With explicit teacher consent, send a chessboard photo (PNG/JPEG/WebP, at most 2MB) to a teacher-configured external AI to PROPOSE a FEN. Images may contain personal information. This is an unverified draft, not a factual reconstruction or a publishing action. All 64 squares and game-state placeholders must be reviewed and corrected before a separate PGN preview and Lichess publication approval.",
    schema:imageFenInputSchema.extend({confirmed:z.literal(true)}).strict(),
    scope:"coach:read",readOnly:false,
  },
  {
    name:"ccp_v1_lichess_puzzle_preview",
    description:"Review a chess-board FEN and solution SAN/PGN inferred from a photo or supplied by the teacher. Display the 8x8 board and exact chapter import preview and SHA-256 for teacher correction. NEVER publish from this tool; image recognition is not a verified FEN until the teacher visually confirms it.",
    schema:puzzleDraftSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_lichess_puzzle_publish",
    description:"Publish exactly one teacher-reviewed FEN puzzle as a Lichess study chapter. Requires separate study:write browser grant, matching SHA-256 from a preview, new UUID idempotency key, and explicit confirmation both to create the chapter and to contact Lichess. Provider timeouts are ambiguous and must be reconciled in browser, never retried automatically.",
    schema:puzzlePublishSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_lichess_studies_search",
    description:"Discover your connected Lichess studies by name, then search a selected 8-character study ID by PGN chapter metadata, opening, ECO or exact chapter number (including chapter 32). Requires study:read browser consent; returns only sanitized chapter metadata, never PGN text or access tokens.",
    schema:z.object({
      studyId:z.string().regex(/^[A-Za-z0-9]{8}$/).optional(),
      query:z.string().max(120).optional(),
      chapterNumber:z.number().int().min(1).max(64).optional(),
      limit:z.number().int().min(1).max(100).default(50),
    }).strict().refine(x=>x.chapterNumber===undefined||!!x.studyId,
      "Choose a study ID before searching an exact chapter number"),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_lichess_connect_handoff",
    description:"Return a secure signed-in browser URL to grant Lichess study:read or separately approve study:write using OAuth PKCE; MCP never receives secrets.",
    schema:z.object({mode:z.enum(["read","write"]).default("read")}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_lichess_connection_disconnect",
    description:"Disconnect/revoke the teacher's Lichess token only with explicit approval. Report provider revocation failures and manual action truthfully.",
    schema:z.object({confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_student_skill_assessments_list",
    description:"Page through complete timestamped 1–5 skill history for an owned student, including archived learners.",
    schema:z.object({studentId:uuid,limit:z.number().int().min(1).max(1000).default(1000),offset:z.number().int().min(0).max(1000000).default(0)}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_student_skill_assessments_record",
    description:"Append teacher-approved 1–5 skill assessments atomically. Supply the same idempotencyKey UUID on retries; one retry key cannot be reused for changed ratings.",
    schema:z.object({studentId:uuid,ratings:z.array(z.object({
      dimensionId:uuid,rating:z.number().int().min(1).max(5),note:z.string().max(2000).optional(),
    }).strict()).min(1).max(20),idempotencyKey:uuid.optional(),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_v1_students_roster",
    description: "Page through active learners by default, all learners with includeArchived=true, or only former pupils with archivedOnly=true. Includes chess profiles and revisions; excludes private notes and guardian contacts.",
    schema: z.object({query:z.string().trim().max(80).optional(),
      includeArchived:z.boolean().default(false),archivedOnly:z.boolean().default(false),
      offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(100).default(50)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name: "ccp_v1_students_profile",
    description: "Read an identified student's profile. Private teacher notes and family/contact fields are excluded unless includePrivate=true AND confirmed=true. Avoid exposing children's information unnecessarily.",
    schema:z.object({studentId:uuid,includePrivate:z.boolean().default(false),confirmed:z.literal(true).optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_students_chess_history",
    description:"Read teacher-entered 1-10 strength, goals, handles and provider/time-control rating changes; timestamps and old/new values are recorded, but no provider verification is implied.",
    schema:z.object({studentId:uuid,
      offset:z.number().int().min(0).max(100000).default(0),
      limit:z.number().int().min(1).max(100).default(50)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_students_delete_impact",
    description:"Read owner-scoped teaching, roster, material, progress and credit dependencies before permanent deletion. Prefer archive for historical students.",
    schema:z.object({studentId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_students_delete",
    description:"Permanently remove an unlinked student profile only with the reviewed revision and explicit teacher confirmation. Historical linked records block this action; archive instead.",
    schema:z.object({studentId:uuid,expectedUpdatedAt:instant,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_v1_students_archive_preview",
    description: "Read the teacher-owned student's archival blockers (recurring slots, future private/group lessons, current group memberships) before requesting archival. No private notes or contacts are exposed.",
    schema:z.object({studentId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name: "ccp_v1_students_profile_edit",
    description: "Edit one student's chess handles, aliases, strength (1-10), teacher-entered ratings, lesson rates, private notes, birthdate, family, or archive state. Use the latest updated_at revision and confirm any privacy-sensitive change; reconcile future commitments before archiving. Reload after conflicts; do not automatically retry a mutation.",
    schema:z.object({studentId:uuid,expectedUpdatedAt:instant,changes:studentUpdateSchema,
      confirmed:z.literal(true)}).strict().refine(v=>Object.keys(v.changes).length>0,"Changes required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_v1_students_search",
    description: "Search only your teacher-owned students. If NEEDS_RESOLUTION is returned ask the teacher which ID they mean before writing.",
    // Unlike ID-directed search inputs, an empty query means an owner-scoped
    // roster browse. The website's students.search permits this too.
    schema: z.object({ query: z.string().trim().max(80).default("") }).strict(),
    scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_groups_list",
    description: "List teacher-owned class groups and their workplace IDs.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_groups_members",
    description: "Get the current group members; for past lessons prefer the frozen session participant roster.",
    schema: z.object({ groupId: uuid }).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_sessions_list",
    description: "Find sessions, their revision timestamp and their existing topic note. Omit query for recent sessions; ambiguity returns NEEDS_RESOLUTION.",
    schema: z.object({
      query: searchText.optional(), workplaceId: uuid.optional(),
    }).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_sessions_participants",
    description: "List a session's frozen participant roster and student IDs, even after group membership changes.",
    schema: sessionId, scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_attendance_preview",
    description: "Read current attendance of each frozen participant, including updated_at revision. For each student, obtain explicit confirmation before calling attendance_record; this is not a bulk-write tool.",
    schema: sessionId, scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_attendance_record",
    description: "Record ONE confirmed participant status after preview. Requires the exact session/student IDs, expectedUpdatedAt from preview, and a fresh idempotencyKey. Retries must reuse the same key and arguments. No bulk updates.",
    schema: z.object({
      sessionId: uuid, studentId: uuid,
      status: z.enum(["present","absent","late","excused","student_cancelled","teacher_cancelled"]),
      note: z.string().max(5000).default(""),
      noticeAt: z.string().datetime({offset:true}).optional(),
      cancelReason: z.string().max(1000).optional(),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
      idempotencyKey: uuid,
    }).strict(), scope: "coach:write", readOnly: false,
  },
  {
    name: "ccp_v1_sessions_note_update",
    description: "Set a confirmed shared lesson topic/note on an identified session with an expected revision from sessions_list. Rejects stale edits; retry using the original idempotencyKey and arguments.",
    schema: z.object({
      sessionId: uuid, lessonNote: z.string().max(10000),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
      idempotencyKey: uuid,
    }).strict(), scope: "coach:write", readOnly: false,
  },
  {
    name:"ccp_v1_chess_categories_create",
    description:"Create a teacher-owned chess skill category. Confirm its label before adding to progress history.",
    schema:z.object({name:categoryName,description:z.string().max(500).optional(),
      sortOrder:z.number().int().min(0).max(10000).optional(),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_chess_categories_update",
    description:"Rename, describe or reorder an existing chess skill category without rewriting observations. Explicit confirmation required.",
    schema:z.object({categoryId:chessUuid,name:categoryName.optional(),
      description:z.string().max(500).optional(),
      sortOrder:z.number().int().min(0).max(10000).optional(),
      confirmed:z.literal(true)}).strict().refine(a=>a.name!==undefined||a.description!==undefined||
      a.sortOrder!==undefined,"Provide a change"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_material_links_unlink_impact",
    description:"Preview removal of one canonical material association; learning material and attested evidence remain intact.",
    schema:z.object({linkId:chessUuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_material_links_unlink",
    description:"Remove one current material/student or material/session association with expected revision and explicit approval. History is preserved.",
    schema:materialLinkUnlinkInput,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_chess_categories_delete_impact",
    description:"Preview whether a teacher-owned chess skill category has historical observations. Used before a confirmed deletion.",
    schema:z.object({categoryId:chessUuid}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_chess_categories_delete",
    description:"Delete only an unused teacher-owned chess skill category after explicit confirmation. Never erase recorded chess observations.",
    schema:z.object({categoryId:chessUuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_chess_observations_update",
    description:"Correct a teacher-owned existing chess observation, skill category or observation date. Do not silently alter confirmed history; teacher approval required.",
    schema:z.object({observationId:chessUuid,observation:observationText.optional(),
      categoryId:chessUuid.optional(),observedAt:observedAt.optional(),
      confirmed:z.literal(true)}).strict().refine(a=>a.observation!==undefined||
      a.categoryId!==undefined||a.observedAt!==undefined,"Provide a correction"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_material_links_update",
    description:"Reassign one identified student/session material link to another canonical typed material; revision check and confirmation required. Edit content via learning_materials_update.",
    schema:materialLinkUpdateInput,scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_v1_chess_categories_list",
    description: "Read configurable teacher-owned chess skills. Select stable category IDs before proposing an observation.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_chess_observations_list",
    description: "Read student chess observation history including source and verification. Never treat agent suggestions as approved.",
    schema: z.object({studentId:chessUuid,sessionId:chessUuid.optional()}).strict(),
    scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_chess_observations_propose",
    description: "PROPOSE an unverified AI-authored observation for one identified student. This never approves or overrides teacher assessments.",
    schema: observationInput, scope: "coach:write", readOnly: false,
  },
  {
    name:"ccp_v1_materials_history_list",
    description:"List **explicitly recorded** study/material stages for a teacher-owned student, workplace or session. Stages distinguish assigned, actually taught, and teacher-attested completed; mere study links are never counted. Workplace results deduplicate sessions in page summary.",
    schema:materialsHistoryFilter,
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_materials_aggregate",
    description:"Summarize the entire filtered student/workplace/session material evidence ledger (not merely the current page). Counts assigned/taught/completed separately and deduplicates group sessions. Explicit teacher evidence only, not inferred mastery; up to 5000 claims.",
    schema:materialsHistoryFilter,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_material_defaults_list",
    description:"Read teacher-owned default Lichess studies for one workplace and optional group, including versioned change history. Defaults do not imply taught or completed.",
    schema:z.object({workplaceId:uuid,groupId:uuid.optional(),
      includeArchived:z.boolean().default(false)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_material_default_create",
    description:"Attach one explicitly confirmed official Lichess study/chapter default to a workplace or group. Idempotent request ID and owner validation; does not claim any student learned it.",
    schema:defaultCreateSchema.omit({operation:true}),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_material_default_update",
    description:"Correct a study default label/link/notes with latest revision and explicit confirmation, retaining the prior values in the audit trail.",
    schema:defaultUpdateToolSchema,
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_material_default_archive",
    description:"Archive a study default with revision and confirmation, retaining historical audits and teaching evidence.",
    schema:defaultArchiveSchema.omit({operation:true}),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_materials_history_record",
    description:"After explicit teacher confirmation, append an assigned/taught/completed claim for a canonical typed material ID and identified learner, optionally tied to workplace/session. requestId makes repeats idempotent; a model must never infer completed from merely opening a study.",
    schema:materialsHistoryRecord,
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_materials_history_void",
    description:"Correct mistaken teaching/learning evidence. Requires exact updatedAt revision, reason and explicit confirmation. Retains original claim in the audit trail; does not silently delete history.",
    schema:materialsHistoryVoid,
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_material_links_list",
    description:"List canonical typed material associations for one teacher-owned student or lesson, including catalog title and source URL.",
    schema:materialLinkListInput,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_material_links_create",
    description:"Attach an existing typed learning material to a student or coaching session, with explicit approval and an idempotent request UUID. Does not imply mastery.",
    schema:materialLinkCreateInput,scope:"coach:write",readOnly:false,
  },
  // All new writes are routed through the single transactional teacher-owned SQL
  // operation. The receipt is replay-safe and contains only IDs and audit metadata.
  {
    name: "ccp_v1_workplaces_create",
    description: "Create a teacher-owned workplace. Confirm its name, IANA time zone and currency.",
    schema: z.object({name:shortName, timezone:z.string().min(1).max(80),
      currency:currency.default("USD"),locale:locale.default("en"),
      policy:resourcePolicy.default({}),...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_workplaces_update",
    description:"Edit an identified workplace using its latest revision from workplaces_list. No silent overwrite.",
    schema:z.object({workplaceId:uuid,name:shortName.optional(),timezone:z.string().min(1).max(80).optional(),
      currency:currency.optional(),locale:locale.optional(),policy:resourcePolicy.optional(),...revision}).strict()
      .refine(v => v.name!==undefined || v.timezone!==undefined || v.currency!==undefined ||
        v.locale!==undefined || v.policy!==undefined,"At least one change is required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_students_create",
    description:"Create a basic teacher-owned learner with name and optional level. For guardian/contact, birthdate, notes, or family-of-one creation use the full shared student create tool.",
    schema:z.object({name:shortName,level:z.string().trim().max(120).nullable().optional(),...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_students_create_full",
    description:"Create a teacher-owned learner with optional owned family, guardian contact, birthdate, level and private teacher notes in ONE atomic website/MCP transaction. Requires an idempotency key and approval; output redacts private notes and contact details.",
    schema:studentCreateSchema.extend({
      idempotencyKey:uuid,confirmed:z.literal(true),
    }).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_students_update",
    description:"Edit a specific student ID, never an ambiguous name. Requires revision from students_search.",
    schema:z.object({studentId:uuid,name:shortName.optional(),
      level:z.string().trim().max(120).nullable().optional(),...revision}).strict()
      .refine(v=>v.name!==undefined||v.level!==undefined,"At least one change is required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_workplaces_enroll",
    description:"Enroll an identified student in an identified workplace. Single-member only.",
    schema:z.object({workplaceId:uuid,studentId:uuid,...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_workplaces_unenroll",
    description:"Explicitly remove one current workplace enrollment. Group memberships and future direct lessons must be cleared first; historic frozen rosters remain untouched.",
    schema:z.object({workplaceId:uuid,studentId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_workplaces_enrollments",
    description:"List members of an identified teacher-owned workplace.",
    schema:z.object({workplaceId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_groups_create",
    description:"Create a class group inside one identified authorized workplace.",
    schema:z.object({workplaceId:uuid,name:shortName,...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_groups_update",
    description:"Rename an identified group within its workplace, with revision and retry key.",
    schema:z.object({groupId:uuid,workplaceId:uuid,name:shortName,...revision}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_groups_enroll",
    description:"Add one identified student to one identified group; the workplace enrollment is included atomically.",
    schema:z.object({groupId:uuid,studentId:uuid,...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_groups_unenroll",
    description:"Remove one explicitly confirmed current group membership. Historical frozen lesson rosters remain unchanged.",
    schema:z.object({groupId:uuid,studentId:uuid,...mutation,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_sessions_ad_hoc_create",
    description:"Schedule a single one-off lesson for 2–50 already enrolled students without a permanent class. Freeze roster and unmarked attendance atomically. Confirm approved participants and time.",
    schema:z.object({workplaceId:uuid,studentIds:z.array(uuid).min(2).max(50),
      title:z.string().trim().min(1).max(160),startsAt:instant,
      durationMinutes:z.number().int().min(15).max(480),
      lessonNote:z.string().max(10000).default(""),idempotencyKey:uuid,
      confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_sessions_details",
    description:"Read one identified lesson, including its current revision and frozen roster.",
    schema:sessionId,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_sessions_create",
    description:"Schedule one identified workplace/group or student lesson at an ISO instant WITH offset; conflicts are rejected. Frozen participants at creation.",
    schema:z.object({workplaceId:uuid,groupId:uuid.optional(),studentId:uuid.optional(),
      title:z.string().trim().min(1).max(160),startsAt:instant,
      durationMinutes:z.number().int().min(15).max(480),lessonNote:z.string().max(10000).default(""),
      ...mutation}).strict().refine(v=>Boolean(v.groupId)!==Boolean(v.studentId),
      "Choose exactly one group or student"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_sessions_edit",
    description:"Confirmed, revision-checked edit of a teaching session's title, shared note, time, duration or scheduled/cancelled status. To mark completed use ccp_v1_sessions_complete with every frozen learner and explicit attendance; status-only completion is prohibited.",
    schema:z.object({
      sessionId:uuid,
      changes:z.object({
        title:z.string().trim().min(1).max(160).optional(),
        startsAt:instant.optional(),
        durationMinutes:z.number().int().min(15).max(480).optional(),
        lessonNote:z.string().max(10000).optional(),
        status:z.enum(["scheduled","cancelled"]).optional(),
      }).strict().refine(x=>Object.keys(x).length>0,"At least one change required"),
      ...revision,confirmed:z.literal(true),
    }).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_sessions_complete",
    description:"Atomically record the complete frozen student roster and mark one coaching lesson completed. Requires one explicit present/absent/late/excused status and current attendance revision per student, current lesson revision, one idempotency UUID and confirmation. No material mastery inferred.",
    schema:lessonCompletionSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_sessions_reschedule",
    description:"Reschedule an identified scheduled lesson; requires its latest revision, explicit offset and confirmation.",
    schema:z.object({sessionId:uuid,startsAt:instant,
      durationMinutes:z.number().int().min(15).max(480),...revision,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_sessions_roster_preview",
    description:"Read the exact frozen roster and revision of one owned session; group enrollments are unaffected.",
    schema:z.object({sessionId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_sessions_roster_correct",
    description:"Confirm one revision-checked correction to a session's FROZEN historical roster, not group membership. Provide all desired owned student IDs, reason and idempotency key; removed attendance is audited. Removing linked chess evidence is blocked.",
    schema:z.object({sessionId:uuid,studentIds:z.array(uuid).min(1).max(100),
      expectedUpdatedAt:instant,idempotencyKey:uuid,
      reason:z.string().trim().min(8).max(1000),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_sessions_roster_revisions_list",
    description:"Read append-only historical roster corrections, redacting removed attendance notes unless includePrivate=true and confirmed=true.",
    schema:z.object({sessionId:uuid,includePrivate:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict()
      .refine(v=>!v.includePrivate||v.confirmed===true,"Private attendance notes require explicit confirmation"),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_sessions_cancel",
    description:"Cancel ONE identified scheduled lesson after confirmation. Does not delete history.",
    schema:z.object({sessionId:uuid,...revision,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },

  {
    name:"ccp_v1_learning_materials_list",
    description:"Search/list teacher-owned chess learning materials by type and title; games, puzzles, drills and studies share a catalog but have different typed details.",
    schema:materialCatalogFilterSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_learning_materials_get",
    description:"Fetch one specific teacher-owned typed chess learning material and its details. A link alone is not proof of teaching.",
    schema:z.object({materialId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_learning_materials_create",
    description:"Create one typed game, puzzle, drill, study chapter or HTTPS link. Student mastery and assignments are separate. Require an idempotency UUID.",
    schema:materialCatalogCreateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_learning_materials_update",
    description:"Correct a teacher-owned typed chess material in one atomic root/subtype transaction. Same kind only; exact revision, confirmation and idempotency UUID required.",
    schema:materialCatalogUpdateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_learning_material_relations_list",
    description:"List typed source-game, derived and prerequisite material relationships. A relationship is not evidence of teaching or mastery.",
    schema:materialRelationListSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_learning_material_relation_change",
    description:"Link/unlink two authorized typed chess materials. Require source revision, explicit confirmation and an idempotency request ID; source-game puzzle extraction requires puzzle → game.",
    schema:materialRelationSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_learning_material_archive_preview",
    description:"Inspect a material's revision, linked homework and relations before attempting a history-preserving library archive.",
    schema:materialArchivePreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_learning_material_lifecycle_change",
    description:"Archive or restore a teacher-owned learning material from active search without erasing history. Requires current revision, request UUID and explicit confirmation; linked materials cannot be archived.",
    schema:materialLifecycleSchema,scope:"coach:write",readOnly:false,
  },

  {
    name:"ccp_v1_training_assignments_list",
    description:"List a teacher's student-specific chess homework, linked materials, documented attempts and reviews. A completed item is not a verified skill assessment.",
    schema:assignmentListSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_training_assignments_create",
    description:"Assign one existing game/puzzle/drill/study material to 1-100 active students, with independent assignment IDs. Explicit confirmation and retry-safe request UUID required.",
    schema:assignmentCreateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_training_attempt_record",
    description:"Record instructor-entered homework attempt/completion evidence without claiming mastery; explicit confirmed idempotent write.",
    schema:assignmentAttemptSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_training_review_record",
    description:"Record separate teacher feedback on one homework assignment or attempt; does not alter a teacher-verified student skill grade.",
    schema:assignmentReviewSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_training_plans_list",
    description:"Read a teacher-owned student's explicit training plans, goals and statuses with no inferred skill mastery; paginated and archived-aware.",
    schema:trainingPlanListSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_training_plans_get",
    description:"Get one training plan with immutable revision snapshots and manually evidenced goal decisions.",
    schema:trainingPlanGetSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_training_plans_commit",
    description:"Create or revision-guard edit a training plan and independent chess goals, requiring teacher confirmation and an idempotency UUID. Achieved goals require explicit coach-written evidence; no inference from homework.",
    schema:trainingPlanCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_coach_briefing_get",
    description:"Prepare a fact-based teacher-owned student briefing: recent lesson history, explicitly attested material, assigned homework, coach reviews and approved chess observations. Each item has stored source IDs, with unknowns marked. No AI-inferred mastery.",
    schema:coachBriefingSchema,scope:"coach:read",readOnly:true,
  },
] as const;

export const exposedTools = catalogue.map(t => ({
  name: t.name, title: t.name,
  description: t.description,
  inputSchema: z.toJSONSchema(t.schema),
  annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false },
}));

export function validateCall(name: string, input: unknown) {
  const tool = catalogue.find(t => t.name === name);
  if (!tool) return { error: { code: "NOT_FOUND", message: "Unknown tool" } };
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) return { error: {
    code: "VALIDATION_ERROR", message: "Invalid input",
    issues: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })),
  } };
  return { tool, args: parsed.data };
}

export async function runTool(db: SupabaseClient, teacherId: string,
  name: string, input: unknown, scopes: string[], clientId: string) {
  const parsed = validateCall(name, input);
  if ("error" in parsed) return { error: parsed.error };
  const { tool, args } = parsed;
  if (!scopes.includes(tool!.scope)) return { error: { code: "FORBIDDEN", message: "Insufficient OAuth scope" } };
  try {
    // Scoped SQL RPC uses the end-user's JWT and RLS, not the service role.
    // It checks expected revision and stores the receipt and domain write in the same transaction.
    const operations: Record<string,string> = {
      ccp_v1_workplaces_create:"workplaces.create",ccp_v1_workplaces_update:"workplaces.update",
      ccp_v1_workplaces_enroll:"workplaces.enroll",
      ccp_v1_students_create:"students.create",ccp_v1_students_update:"students.update",
      ccp_v1_groups_create:"groups.create",ccp_v1_groups_update:"groups.update",
      ccp_v1_groups_enroll:"groups.enroll",ccp_v1_groups_unenroll:"groups.unenroll",
      ccp_v1_sessions_create:"sessions.create",ccp_v1_sessions_reschedule:"sessions.reschedule",
      ccp_v1_sessions_cancel:"sessions.cancel",
    };
    if (name in operations) {
      // A repeated student-create idempotency key must be able to replay
      // even after its first success used the last hosted slot. Capacity is
      // enforced atomically by the database trigger on all NEW inserts.
      const payload = args as Record<string,unknown>;
      if (payload.timezone !== undefined) {
        // The browser's canonical domain operation also rejects invalid IANA zones.
        const {assertTimezone} = await import("@/lib/server/coach-service");
        assertTimezone(payload.timezone as string);
      }
      const {data,error} = await db.rpc("agent_coaching_mutate",{
        p_operation:operations[name],
        p_payload:payload,
        p_expected_updated_at:payload.expectedUpdatedAt ?? null,
        p_idempotency_key:payload.idempotencyKey,
        p_client_id:clientId,
      });
      if (error) {
        const msg = error.message || "";
        const code = /HOSTED_LIMIT_REACHED/.test(msg)?"HOSTED_LIMIT_REACHED":
          /FUTURE_COMMITMENTS/.test(msg)?"FUTURE_COMMITMENTS":
          /CONFLICT|23505|23P01/.test(msg)?"CONFLICT":
          /NOT_FOUND/.test(msg)?"NOT_FOUND":"VALIDATION_ERROR";
        return {error:{code,message:"Mutation rejected. Re-read the authorized record and verify IDs, revision, and schedule."}};
      }
      return {data};
    }
    switch (name) {
      case "ccp_v1_training_plans_list":
        return {data:await teacherTrainingPlansList(db,teacherId,args as Parameters<typeof teacherTrainingPlansList>[2])};
      case "ccp_v1_training_plans_get":
        return {data:await teacherTrainingPlanGet(db,teacherId,(args as {planId:string}).planId)};
      case "ccp_v1_training_plans_commit":
        return {data:await teacherTrainingPlanCommit(db,teacherId,args as Parameters<typeof teacherTrainingPlanCommit>[2])};
      case "ccp_v1_coach_briefing_get":
        return {data:await teacherCoachBriefing(db,teacherId,args as Parameters<typeof teacherCoachBriefing>[2])};
      case "ccp_v1_training_assignments_list":
        return {data:await teacherAssignmentsList(db,teacherId,args as Parameters<typeof teacherAssignmentsList>[2])};
      case "ccp_v1_training_assignments_create":
        return {data:await teacherAssignmentsCreate(db,teacherId,args as Parameters<typeof teacherAssignmentsCreate>[2])};
      case "ccp_v1_training_attempt_record":
        return {data:await teacherAssignmentAttempt(db,teacherId,args as Parameters<typeof teacherAssignmentAttempt>[2])};
      case "ccp_v1_training_review_record":
        return {data:await teacherAssignmentReview(db,teacherId,args as Parameters<typeof teacherAssignmentReview>[2])};
      case "ccp_v1_learning_materials_list":
        return {data:await teacherMaterialCatalogList(db,teacherId,args as Parameters<typeof teacherMaterialCatalogList>[2])};
      case "ccp_v1_learning_materials_get":
        return {data:await teacherMaterialCatalogGet(db,teacherId,(args as {materialId:string}).materialId)};
      case "ccp_v1_learning_materials_create":
        return {data:await teacherMaterialCatalogCreate(db,teacherId,args as Parameters<typeof teacherMaterialCatalogCreate>[2])};
      case "ccp_v1_learning_materials_update":
        return {data:await teacherMaterialCatalogUpdate(db,teacherId,args as Parameters<typeof teacherMaterialCatalogUpdate>[2])};
      case "ccp_v1_learning_material_relations_list":
        return {data:await teacherMaterialRelationsList(db,teacherId,(args as {materialId:string}).materialId)};
      case "ccp_v1_learning_material_relation_change":
        return {data:await teacherMaterialRelationChange(db,teacherId,args as Parameters<typeof teacherMaterialRelationChange>[2])};
      case "ccp_v1_learning_material_archive_preview":
        return {data:await teacherMaterialArchivePreview(db,teacherId,(args as {materialId:string}).materialId)};
      case "ccp_v1_learning_material_lifecycle_change":
        return {data:await teacherMaterialLifecycleChange(db,teacherId,args as Parameters<typeof teacherMaterialLifecycleChange>[2])};
      case "ccp_v1_students_create_full": {
        const a=args as Parameters<typeof createStudentWithOptionalFamily>[2];
        const result=await createStudentWithOptionalFamily(db,teacherId,a);
        if(!result.ok)return {error:{
          code:result.status===403?"HOSTED_LIMIT_REACHED":
            result.status===404?"NOT_FOUND":
            result.status===409?"IDEMPOTENCY_CONFLICT":
            result.status===400?"VALIDATION_ERROR":"DATABASE_ERROR",
          message:result.error,
        }};
        return {data:{...safeStudentProfile(result.student),
          createdFamily:result.createdFamily}};
      }
      case "ccp_v1_billing_generation_preview": {
        const a=args as {periodStart:string;periodEnd:string};
        return await billingActionResponse(await teacherBillingGenerate(db,teacherId,a));
      }
      case "ccp_v1_billing_generation_commit": {
        const a=args as {periodStart:string;periodEnd:string;idempotencyKey?:string};
        // The MCP approval marker is transport metadata, never an ordinary
        // domain edit field; pass only fields accepted by the website service.
        return await billingActionResponse(await teacherBillingGenerate(db,teacherId,{
          periodStart:a.periodStart,periodEnd:a.periodEnd,
          idempotencyKey:a.idempotencyKey,commit:true,
        }));
      }
      case "ccp_v1_billing_invoice_regenerate": {
        const a=args as {invoiceId:string;expectedUpdatedAt?:string;idempotencyKey?:string};
        return await billingActionResponse(await teacherBillingRegenerate(db,teacherId,a.invoiceId,{
          expectedUpdatedAt:a.expectedUpdatedAt,idempotencyKey:a.idempotencyKey,
        }));
      }
      case "ccp_v1_billing_invoice_pdf": {
        const a=args as {invoiceId:string};
        const loaded=await loadInvoicePdf(db,{invoiceId:a.invoiceId,teacherId});
        if(!loaded.ok)return {error:{code:loaded.code.toUpperCase(),message:"Unable to generate invoice PDF"}};
        return invoicePdfMcpPayload(loaded.data.pdfBytes,loaded.data.filename);
      }
      case "ccp_v1_billing_invoice_checkout": {
        const a=args as {invoiceId:string};
        return await billingActionResponse(await teacherBillingCheckout(db,teacherId,a.invoiceId,oauthOrigin()));
      }
      case "ccp_v1_billing_invoices_bulk_preview": {
        const a=args as {ids:string[];includeRecipients:boolean;confirmed?:boolean};
        return await billingActionResponse(await teacherBillingBulkPreview(
          db,teacherId,a.ids,a.includeRecipients&&a.confirmed===true));
      }
      case "ccp_v1_billing_invoices_bulk": {
        const a=args as {ids:string[];action:"send"|"delete"|"void";
          confirmedEmail?:boolean;previewDigest?:string};
        const user=(await db.auth.getUser()).data.user;
        return await billingActionResponse(await teacherBillingBulk(
          db,teacherId,user?.email,oauthOrigin(),{
            ids:a.ids,action:a.action,confirmedEmail:a.confirmedEmail,
            previewDigest:a.previewDigest,
          }));
      }
      case "ccp_v1_import_spreadsheet_parse": {
        const a=args as {filename:string;base64:string};
        const bytes=Buffer.from(a.base64,"base64");
        if(bytes.length>MAX_SPREADSHEET_BYTES)
          return {error:{code:"FILE_TOO_LARGE",message:"Spreadsheet exceeds 2 MB"}};
        const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
        return {data:teacherSpreadsheetParse(a.filename,arrayBuffer)};
      }
      case "ccp_v1_import_spreadsheet_preview": {
        const a=args as {rows:Record<string,string>[];mapping:ColumnMapping};
        return {data:teacherSpreadsheetPreview(a)};
      }
      case "ccp_v1_import_spreadsheet_suggest": {
        const a=args as {headers:string[];sampleRows?:Record<string,string>[];useAi:boolean;confirmedExternal?:boolean};
        return {data:await teacherSpreadsheetSuggest(db,teacherId,a)};
      }
      case "ccp_v1_import_spreadsheet_commit": {
        const a=args as {rows:Record<string,string>[];mapping:ColumnMapping;idempotencyKey?:string};
        const response=await teacherSpreadsheetCommit(db,teacherId,a);
        const data=await response.json();
        if(!response.ok)
          return {error:{code:response.status===403?"HOSTED_LIMIT_REACHED":
            response.status===409?"CONFLICT":"VALIDATION_ERROR",
            message:data.error??"Spreadsheet import failed"}};
        return {data};
      }
      case "ccp_v1_settings_export":
        return {data:await teacherSafeExport(db,teacherId)};
      case "ccp_v1_settings_import_preview": {
        const a=args as {payload:unknown};
        const {payload,...preview}=teacherImportPreview(a.payload);
        return {data:preview};
      }
      case "ccp_v1_settings_import_apply": {
        const a=args as {payload:unknown;expectedSha256:string};
        return {data:await teacherImportApply(db,teacherId,a.payload,a.expectedSha256)};
      }
      case "ccp_v1_billing_manual_payment_record": {
        const a=args as {invoiceId:string;amountCents?:number;note?:string;idempotencyKey:string};
        return {data:await teacherManualPaymentRecord(db,teacherId,a.invoiceId,a)};
      }
      case "ccp_v1_billing_manual_payment_delete": {
        const a=args as {invoiceId:string;paymentId:string};
        return {data:await teacherManualPaymentDelete(db,teacherId,a.invoiceId,a.paymentId)};
      }
      case "ccp_v1_credits_packages_list": {
        const a=args as {studentId?:string};
        return {data:await teacherCreditPackagesList(db,teacherId,a.studentId)};
      }
      case "ccp_v1_credits_package_create": {
        const a=args as Parameters<typeof teacherCreditPackageCreate>[2];
        return {data:await teacherCreditPackageCreate(db,teacherId,a)};
      }
      case "ccp_v1_credits_package_expiry": {
        const a=args as {packageId:string;expiresOn:string|null};
        return {data:await teacherCreditPackageExpiry(db,teacherId,a.packageId,a.expiresOn)};
      }
      case "ccp_v1_credits_redemption_return": {
        const a=args as {redemptionId:string};
        return {data:await teacherCreditRedemptionReturn(db,teacherId,a.redemptionId)};
      }
      case "ccp_v1_connections_list":
        return {data:await teacherConnectionsList(teacherId)};
      case "ccp_v1_connections_revoke": {
        const a=args as {connectionId:string};
        return {data:await teacherConnectionRevoke(teacherId,a.connectionId)};
      }
      case "ccp_v1_billing_invoice_draft_update": {
        const a=args as {invoiceId:string;changes:Parameters<typeof teacherInvoiceDraftUpdate>[3]};
        return {data:await teacherInvoiceDraftUpdate(db,teacherId,a.invoiceId,a.changes)};
      }
      case "ccp_v1_billing_invoice_void": {
        const a=args as {invoiceId:string;idempotencyKey?:string};
        return {data:await teacherInvoiceVoid(db,teacherId,a.invoiceId,a.idempotencyKey)};
      }
      case "ccp_v1_billing_invoice_delete": {
        const a=args as {invoiceId:string};
        return {data:await teacherInvoiceDelete(db,teacherId,a.invoiceId)};
      }
      case "ccp_v1_billing_invoice_send_preview": {
        const a=args as {invoiceId:string;includeRecipients:boolean;confirmed?:boolean};
        return {data:await teacherInvoiceSendPreview(
          db,teacherId,a.invoiceId,a.includeRecipients&&a.confirmed===true)};
      }
      case "ccp_v1_billing_invoice_send": {
        const a=args as {invoiceId:string};
        const user=(await db.auth.getUser()).data.user;
        const result=await teacherInvoiceSend(db,teacherId,a.invoiceId,user?.email,oauthOrigin());
        const {checkoutUrl,...safe}=result;
        return {data:{...safe,checkoutCreated:Boolean(checkoutUrl)}};
      }
      case "ccp_v1_billing_invoices_list": {
        const a=args as Parameters<typeof teacherInvoicesList>[2];
        return {data:await teacherInvoicesList(db,teacherId,a)};
      }
      case "ccp_v1_billing_invoice_detail": {
        const a=args as {invoiceId:string;includePrivate:boolean;confirmed?:boolean};
        const invoice=await teacherInvoiceDetail(db,teacherId,a.invoiceId);
        return {data:safeInvoice(invoice,a.includePrivate&&a.confirmed===true)};
      }
      case "ccp_v1_billing_payments_export": {
        const a=args as {from?:string;to?:string};
        const report=await teacherPaymentsExport(db,teacherId,a);
        return {data:{...report,format:"csv"}};
      }
      case "ccp_v1_studio_policy_get": {
        const a=args as {includePaymentQrCode:boolean;confirmed?:boolean};
        const p=await teacherPolicyView(db,teacherId);
        return {data:{...p,
          payment_qr_code:a.includePaymentQrCode&&a.confirmed===true
            ?p.payment_qr_code:null,
          paymentQrCodeConfigured:Boolean(p.payment_qr_code)}};
      }
      case "ccp_v1_studio_credentials_handoff": {
        const a=args as {kind:"ai"|"stripe"};
        const policy=await teacherPolicyView(db,teacherId);
        const isAi=a.kind==="ai";
        const setupPath=isAi
          ?"/account#optional-ai-credentials"
          :"/billing?paymentSettings=1";
        return {data:{
          kind:a.kind,setupPath,setupUrl:oauthOrigin()+setupPath,
          configured:isAi?Boolean(policy.ai.apiKey.configured):
            Boolean(policy.stripe.secretKey.configured&&
              policy.stripe.publishableKey.configured),
          requiresAuthenticatedBrowser:true,
          credentialValuesIncluded:false,
          instruction:"Open the setup URL in your authenticated browser and enter the credentials there. Never paste API keys into AI chat.",
        }};
      }
      case "ccp_v1_studio_policy_update": {
        const a=args as {changes:Record<string,unknown>};
        const user=(await db.auth.getUser()).data.user;
        const response=await teacherPolicyUpdate(db,teacherId,user?.email,a.changes);
        const body=await response.json();
        if(!response.ok)return {error:{
          code:response.status===400?"VALIDATION_ERROR":"DATABASE_ERROR",
          message:body.error??"Could not update studio policy",
        }};
        return {data:{...body,payment_qr_code:null,
          paymentQrCodeConfigured:Boolean(body.payment_qr_code)}};
      }
      case "ccp_v1_events_list":
        return {data:await teacherEventsList(db,teacherId)};
      case "ccp_v1_events_detail": {
        const a=args as {eventId:string;includeRsvps:boolean;confirmed?:boolean};
        const result=await teacherEventDetail(db,teacherId,a.eventId);
        return {data:{event:{
          ...result.event,
          rsvps:a.includeRsvps&&a.confirmed===true?result.event.rsvps:[],
        }}};
      }
      case "ccp_v1_events_create": {
        const a=args as Parameters<typeof teacherEventCreate>[2];
        return {data:await teacherEventCreate(db,teacherId,a)};
      }
      case "ccp_v1_events_update": {
        const a=args as Parameters<typeof teacherEventUpdate>[3]&{eventId:string};
        return {data:await teacherEventUpdate(db,teacherId,a.eventId,a)};
      }
      case "ccp_v1_events_delete_impact": {
        const a=args as {eventId:string};
        return {data:await teacherEventDeleteImpact(db,teacherId,a.eventId)};
      }
      case "ccp_v1_events_delete": {
        const a=args as {eventId:string};
        return {data:await teacherEventDelete(db,teacherId,a.eventId)};
      }
      case "ccp_v1_reports_student_progress":
        return {data:await teacherStudentProgressReport(
          db,teacherId,(args as {studentId:string}).studentId)};
      case "ccp_v1_account_security_handoff":
        return {data:{
          url:oauthOrigin()+"/account",
          browserOnly:true,
          action:"account-security",
          explanation:"Open the signed-in Account page and complete any required reauthentication. Email, password, MFA keys and recovery codes must never be submitted to a model.",
        }};
      case "ccp_v1_hosted_subscription_handoff":
        return {data:{
          url:oauthOrigin()+"/account",
          browserOnly:true,
          action:"hosted-billing",
          explanation:"On hosted deployments, review the plan and choose Upgrade or Manage billing in your signed-in browser. Payment-card entry and Stripe sessions remain in secure website/provider flows.",
        }};
      case "ccp_v1_teacher_profile_get":
        return {data:await teacherProfileGet(db,teacherId)};
      case "ccp_v1_teacher_profile_update": {
        const a=args as {displayName?:string;avatarUrl?:string|null;confirmed:true};
        // Approval is an MCP transport control, never an editable profile field.
        // Pass only the same domain fields accepted by the website.
        return {data:await teacherProfileUpdate(db,teacherId,{
          displayName:a.displayName,avatarUrl:a.avatarUrl,
        })};
      }
      case "ccp_v1_calendar_feed_status":
        return {data:await teacherCalendarFeedStatus(db,teacherId)};
      case "ccp_v1_calendar_feed_rotate":
        return {data:await teacherCalendarFeedRotate(db,teacherId)};
      case "ccp_v1_events_email_preview": {
        const a=args as {eventId:string;includeRecipients:boolean;confirmed?:boolean};
        return {data:await teacherEventInvitePreview(
          db,teacherId,a.eventId,a.includeRecipients&&a.confirmed===true)};
      }
      case "ccp_v1_events_email_invites": {
        const a=args as {eventId:string};
        const user=(await db.auth.getUser()).data.user;
        return {data:await teacherEventInviteEmail(db,teacherId,a.eventId,user?.email,oauthOrigin())};
      }
      case "ccp_v1_calendar_attendance_read": {
        const a=args as {lessonId:string};
        return {data:await calendarAttendanceRead(db,teacherId,a.lessonId)};
      }
      case "ccp_v1_calendar_attendance_record": {
        const a=args as {lessonId:string;notifyFamily:boolean;status:"attended"|"teacher_cancel"|"student_cancel"|"no_show"|null;
          noticeChoice?:"now"|"timely"|"late"|"custom";noticeAt?:string|null;cancelNote?:string;
          expectedMarkedAt?:string|null;idempotencyKey?:string};
        const user=a.notifyFamily?(await db.auth.getUser()).data.user:null;
        return {data:await calendarAttendanceWrite(db,teacherId,a.lessonId,a,{
          origin:a.notifyFamily?oauthOrigin():"",
          teacherEmail:user?.email,
        })};
      }
      case "ccp_v1_calendar_attendance_bulk": {
        const a=args as {ids:string[];status:"attended"|"no_show"|"teacher_cancel";notifyFamily:boolean;
          idempotencyKey?:string;expectedMarkedAtByLesson?:Record<string,string|null>};
        const user=a.notifyFamily?(await db.auth.getUser()).data.user:null;
        return {data:await calendarAttendanceBulk(db,teacherId,a,{
          origin:a.notifyFamily?oauthOrigin():"",teacherEmail:user?.email,
        })};
      }
      case "ccp_v1_calendar_lesson_note_read": {
        const a=args as {lessonId:string;includePrivate:boolean;confirmed?:boolean};
        const note=await calendarLessonNoteRead(db,teacherId,a.lessonId);
        if(!note||a.includePrivate&&a.confirmed===true)return {data:note};
        const {private_body,...safe}=note;
        return {data:safe};
      }
      case "ccp_v1_calendar_lesson_note_update": {
        const a=args as {lessonId:string;body?:string;privateBody?:string;sendEmail:boolean};
        const user=a.sendEmail?(await db.auth.getUser()).data.user:null;
        return {data:await calendarLessonNoteWrite(db,teacherId,a.lessonId,a,{
          origin:a.sendEmail?oauthOrigin():"",teacherEmail:user?.email,
        })};
      }
      case "ccp_v1_calendar_slots_list": {
        const a=args as {studentId?:string;activeOnly?:boolean};
        return {data:await calendarSlotsList(db,teacherId,a)};
      }
      case "ccp_v1_calendar_slots_create": {
        const a=args as Parameters<typeof calendarSlotCreate>[2];
        return {data:await calendarSlotCreate(db,teacherId,a)};
      }
      case "ccp_v1_calendar_slots_update": {
        const a=args as {slotId:string;changes:Parameters<typeof calendarSlotUpdate>[3]};
        return {data:await calendarSlotUpdate(db,teacherId,a.slotId,a.changes)};
      }
      case "ccp_v1_calendar_slots_delete": {
        const a=args as {slotId:string};
        return {data:await calendarSlotDelete(db,teacherId,a.slotId)};
      }
      case "ccp_v1_calendar_lessons_list": {
        const a=args as Parameters<typeof calendarLessonsList>[2];
        return {data:await calendarLessonsList(db,teacherId,a)};
      }
      case "ccp_v1_calendar_lessons_detail": {
        const a=args as {lessonId:string};
        return {data:await calendarLessonDetail(db,teacherId,a.lessonId)};
      }
      case "ccp_v1_calendar_lessons_create": {
        const a=args as Parameters<typeof calendarLessonCreate>[2];
        return {data:await calendarLessonCreate(db,teacherId,a)};
      }
      case "ccp_v1_calendar_lessons_update": {
        const a=args as {lessonId:string;changes:Parameters<typeof calendarLessonUpdate>[3]};
        return {data:await calendarLessonUpdate(db,teacherId,a.lessonId,a.changes)};
      }
      case "ccp_v1_calendar_lessons_delete": {
        const a=args as {lessonId:string};
        return {data:await calendarLessonDelete(db,teacherId,a.lessonId)};
      }
      case "ccp_v1_guardians_list": {
        const rows=await guardiansList(db,teacherId);
        return {data:rows.map(row=>safeGuardian(row))};
      }
      case "ccp_v1_guardians_detail": {
        const a=args as {guardianId:string;includeContacts:boolean;confirmed?:boolean};
        const row=await guardianDetail(db,teacherId,a.guardianId);
        return {data:safeGuardian(row,a.includeContacts&&a.confirmed===true)};
      }
      case "ccp_v1_guardians_create": {
        const a=args as Parameters<typeof guardianCreate>[2];
        const row=await guardianCreate(db,teacherId,a);
        return {data:safeGuardian(row)};
      }
      case "ccp_v1_guardians_update": {
        const a=args as Parameters<typeof guardianUpdate>[3] & {guardianId:string};
        const row=await guardianUpdate(db,teacherId,a.guardianId,a);
        return {data:safeGuardian(row)};
      }
      case "ccp_v1_guardians_delete_impact": {
        const a=args as {guardianId:string};
        return {data:await guardianDeleteImpact(db,teacherId,a.guardianId)};
      }
      case "ccp_v1_guardians_delete": {
        const a=args as {guardianId:string};
        return {data:await guardianDelete(db,teacherId,a.guardianId)};
      }
      case "ccp_v1_guardians_rotate_portal_token": {
        const a=args as {guardianId:string;requestId?:string};
        const rotated=await guardianRotatePortalToken(db,teacherId,a.guardianId,a.requestId);
        return {data:{ok:true,id:rotated.id,replayed:rotated.replayed,
          secretNotReturned:true}};
      }
      case "ccp_v1_skill_dimensions_list":
        return {data:await skillDimensionsList(db,teacherId)};
      case "ccp_v1_skill_dimensions_create": {
        const a=args as {name:string;requestId?:string};
        return {data:await skillDimensionsCreate(db,teacherId,a.name,a.requestId)};
      }
      case "ccp_v1_skill_dimensions_update": {
        const a=args as {dimensionId:string;name:string};
        return {data:await skillDimensionsUpdate(db,teacherId,a.dimensionId,a.name)};
      }
      case "ccp_v1_skill_dimensions_delete_impact": {
        const a=args as {dimensionId:string};
        return {data:await skillDimensionsDeleteImpact(db,teacherId,a.dimensionId)};
      }
      case "ccp_v1_skill_dimensions_delete": {
        const a=args as {dimensionId:string;expectedAssessmentCount:number};
        return {data:await skillDimensionsDelete(db,teacherId,a.dimensionId,a.expectedAssessmentCount)};
      }
      case "ccp_v1_lichess_connection_status": {
        return {data:await lichessConnectionStatus(teacherId)};
      }
      case "ccp_v1_lichess_image_fen_propose": {
        const input=args as Parameters<typeof teacherImageFenPropose>[2];
        return {data:await teacherImageFenPropose(db,teacherId,input)};
      }
      case "ccp_v1_lichess_puzzle_preview": {
        return {data:teacherLichessPuzzlePreview(args as Parameters<typeof teacherLichessPuzzlePreview>[0])};
      }
      case "ccp_v1_lichess_puzzle_publish": {
        return {data:await teacherLichessPuzzlePublish(
          db,teacherId,args as Parameters<typeof teacherLichessPuzzlePublish>[2])};
      }
      case "ccp_v1_lichess_studies_search": {
        const a=args as {studyId?:string;query?:string;chapterNumber?:number;limit:number};
        return {data:await teacherLichessStudiesSearch(teacherId,a)};
      }
      case "ccp_v1_lichess_connect_handoff": {
        const a=args as {mode:"read"|"write"};
        return {data:lichessConnectionHandoff(a.mode)};
      }
      case "ccp_v1_lichess_connection_disconnect": {
        return {data:await disconnectLichess(teacherId)};
      }
      case "ccp_v1_student_skill_assessments_list": {
        const a=args as {studentId:string;limit:number;offset:number};
        return {data:await studentSkillAssessmentsList(db,teacherId,a.studentId,{limit:a.limit,offset:a.offset})};
      }
      case "ccp_v1_student_skill_assessments_record": {
        const a=args as {studentId:string;ratings:Parameters<typeof studentSkillAssessmentsRecord>[3];idempotencyKey?:string};
        return {data:await studentSkillAssessmentsRecord(db,teacherId,a.studentId,a.ratings,a.idempotencyKey)};
      }
      case "ccp_v1_students_roster": {
        const a=args as {query?:string;includeArchived:boolean;archivedOnly:boolean;offset:number;limit:number};
        const result=await teacherStudentsRoster(db,teacherId,a);
        return {data:{students:result.students.map(safeStudentProfile),nextOffset:result.nextOffset}};
      }
      case "ccp_v1_students_profile": {
        const a=args as {studentId:string;includePrivate:boolean;confirmed?:boolean};
        const profile=await teacherStudentProfile(db,teacherId,a.studentId);
        return {data:a.includePrivate && a.confirmed ? profile : safeStudentProfile(profile)};
      }
      case "ccp_v1_students_chess_history": {
        const a=args as {studentId:string;offset:number;limit:number};
        return {data:await teacherStudentChessHistory(db,teacherId,a.studentId,a)};
      }
      case "ccp_v1_students_delete_impact": {
        const a=args as {studentId:string};
        return {data:await teacherStudentDeleteImpact(db,teacherId,a.studentId)};
      }
      case "ccp_v1_students_delete": {
        const a=args as {studentId:string;expectedUpdatedAt:string};
        return {data:await teacherStudentDelete(db,teacherId,a.studentId,a.expectedUpdatedAt)};
      }
      case "ccp_v1_students_archive_preview": {
        const arg=args as {studentId:string};
        return {data:await teacherStudentArchivePreview(db,teacherId,arg.studentId)};
      }
      case "ccp_v1_students_profile_edit": {
        const a=args as {studentId:string;expectedUpdatedAt:string;changes:Parameters<typeof teacherStudentPatch>[3]};
        return {data:await teacherStudentPatch(db,teacherId,a.studentId,a.changes,a.expectedUpdatedAt)};
      }
      case "ccp_v1_dashboard_summary":
        return { data: await teacherDashboardSummary(db, teacherId) };
      case "ccp_v1_notifications_list":
        return { data: await teacherNotificationsList(db, teacherId) };
      case "ccp_v1_notifications_mark_read": {
        const a = args as { id?: string; all?: boolean };
        try {
          return { data: await teacherNotificationsMarkRead(db, teacherId, a) };
        } catch (error) {
          if (error instanceof TeacherOverviewError) return { error: {
            code: error.status === 400 ? "VALIDATION_ERROR" : "DATABASE_ERROR",
            message: error.message,
          } };
          throw error;
        }
      }
      case "ccp_v1_lessons_history_unified": {
        const a=args as Parameters<typeof teacherUnifiedLessonHistory>[2];
        return {data:await teacherUnifiedLessonHistory(db,teacherId,a)};
      }
      case "ccp_v1_reports_workplace_summary": {
        const a = args as { workplaceId: string; from: string; to: string; format: "json" | "csv" | "text" };
        try {
          const result = await workplaceTeachingReport(db, teacherId, a.workplaceId, a.from, a.to);
          if (a.format === "csv") return { data: { ...result, format: "csv", export: reportCsv(result.report) } };
          if (a.format === "text") return { data: { ...result, format: "text", export: reportText(result.report) } };
          return { data: result };
        } catch (error) {
          if (error instanceof ReportServiceError) return { error: {
            code: error.status === 404 ? "NOT_FOUND" : error.status === 400 ? "VALIDATION_ERROR" : "DATABASE_ERROR",
            message: error.status === 404 ? "Workplace not found" :
              error.status === 400 ? "Invalid report range or workplace" : "Report unavailable",
          } };
          throw error;
        }
      }
      case "ccp_v1_chess_categories_create": {
        const a=args as {name:string;description?:string;sortOrder?:number};
        return {data:await chessCategoriesCreate(db,teacherId,a)};
      }
      case "ccp_v1_chess_categories_update": {
        const a=args as {categoryId:string;name?:string;description?:string;sortOrder?:number};
        return {data:await chessCategoriesUpdate(db,teacherId,a.categoryId,a)};
      }
      case "ccp_v1_chess_categories_delete_impact": {
        const a=args as {categoryId:string};
        return {data:await chessCategoriesDeleteImpact(db,teacherId,a.categoryId)};
      }
      case "ccp_v1_chess_categories_delete": {
        const a=args as {categoryId:string;confirmed:true};
        return {data:await chessCategoriesDelete(db,teacherId,a.categoryId)};
      }
      case "ccp_v1_chess_observations_update": {
        const a=args as {observationId:string;observation?:string;categoryId?:string;observedAt?:string};
        return {data:await chessObservationsUpdate(db,teacherId,a.observationId,a)};
      }
      case "ccp_v1_material_links_unlink_impact": {
        const a=args as {linkId:string};
        return {data:await materialLinksUnlinkImpact(db,teacherId,a.linkId)};
      }
      case "ccp_v1_material_links_unlink": {
        const a=args as Parameters<typeof materialLinksUnlink>[2];
        return {data:await materialLinksUnlink(db,teacherId,a)};
      }
      case "ccp_v1_material_links_update": {
        const a=args as Parameters<typeof materialLinksUpdate>[2];
        return {data:await materialLinksUpdate(db,teacherId,a)};
      }
      case "ccp_v1_chess_categories_list":
        return { data: await chessCategoriesList(db,teacherId) };
      case "ccp_v1_chess_observations_list": {
        const a=args as {studentId:string;sessionId?:string};
        return { data: await chessObservationsList(db,teacherId,a.studentId,a.sessionId) };
      }
      case "ccp_v1_chess_observations_propose": {
        const a=args as Parameters<typeof chessObservationsCreate>[2];
        return { data: await chessObservationsCreate(db,teacherId,a,"agent") };
      }
      case "ccp_v1_materials_history_list": {
        const a=args as Parameters<typeof teacherMaterialHistory>[2];
        return {data:await teacherMaterialHistory(db,teacherId,a)};
      }
      case "ccp_v1_materials_aggregate": {
        return {data:await teacherMaterialAggregate(db,teacherId,args as Parameters<typeof teacherMaterialAggregate>[2])};
      }
      case "ccp_v1_material_defaults_list": {
        const a=args as Parameters<typeof teacherMaterialDefaultsList>[2];
        return {data:await teacherMaterialDefaultsList(db,teacherId,a)};
      }
      case "ccp_v1_material_default_create": {
        return {data:await teacherMaterialDefaultCreate(db,teacherId,
          defaultCreateSchema.parse({...args,operation:"default.create"}))};
      }
      case "ccp_v1_material_default_update": {
        return {data:await teacherMaterialDefaultUpdate(db,teacherId,
          defaultUpdateSchema.parse({...args,operation:"default.update"}))};
      }
      case "ccp_v1_material_default_archive": {
        return {data:await teacherMaterialDefaultArchive(db,teacherId,
          defaultArchiveSchema.parse({...args,operation:"default.archive"}))};
      }
      case "ccp_v1_materials_history_record": {
        const a=args as Parameters<typeof teacherMaterialRecord>[2];
        return {data:await teacherMaterialRecord(db,teacherId,a)};
      }
      case "ccp_v1_materials_history_void": {
        const a=args as Parameters<typeof teacherMaterialVoid>[2];
        return {data:await teacherMaterialVoid(db,teacherId,a)};
      }
      case "ccp_v1_material_links_list": {
        const a=args as Parameters<typeof materialLinksList>[2];
        return {data:await materialLinksList(db,teacherId,a)};
      }
      case "ccp_v1_material_links_create": {
        const a=args as Parameters<typeof materialLinksCreate>[2];
        return {data:await materialLinksCreate(db,teacherId,a)};
      }
      case "ccp_v1_workplaces_enrollments":
        return {data:await workplacesEnrollments(db,teacherId,(args as {workplaceId:string}).workplaceId)};
      case "ccp_v1_workplaces_unenroll": {
        const a=args as {workplaceId:string;studentId:string};
        return {data:await workplacesUnenroll(db,teacherId,a.workplaceId,a.studentId)};
      }
      case "ccp_v1_sessions_ad_hoc_create": {
        const a=args as {workplaceId:string;studentIds:string[];title:string;
          startsAt:string;durationMinutes:number;lessonNote:string;idempotencyKey:string};
        return {data:await sessionsAdHocCreate(db,teacherId,{
          ...a,requestId:a.idempotencyKey,
        })};
      }
      case "ccp_v1_sessions_edit": {
        const a=args as {sessionId:string;changes:{title?:string;startsAt?:string;
          durationMinutes?:number;lessonNote?:string;
          status?:"scheduled"|"completed"|"cancelled"};
          expectedUpdatedAt:string;idempotencyKey:string};
        const updated=await sessionsUpdate(db,teacherId,a.sessionId,{
          ...a.changes,expectedUpdatedAt:a.expectedUpdatedAt,requestId:a.idempotencyKey,
        });
        return {data:updated};
      }
      case "ccp_v1_sessions_complete": {
        return {data:await sessionsComplete(db,teacherId,args as LessonCompletionInput)};
      }
      case "ccp_v1_sessions_roster_preview": {
         const a=args as {sessionId:string};
         return {data:await teacherSessionRosterPreview(db,teacherId,a.sessionId)};
       }
       case "ccp_v1_sessions_roster_correct": {
         const a=args as {sessionId:string;studentIds:string[];
           expectedUpdatedAt:string;idempotencyKey:string;reason:string};
         return {data:await teacherSessionRosterCorrect(db,teacherId,a.sessionId,a)};
       }
       case "ccp_v1_sessions_roster_revisions_list": {
         const a=args as {sessionId:string;includePrivate:boolean;confirmed?:boolean};
         return {data:await teacherSessionRosterAudit(db,teacherId,a.sessionId,
           a.includePrivate&&a.confirmed===true)};
       }
       case "ccp_v1_sessions_details": {
        const id=(args as {sessionId:string}).sessionId;
        const {data,error}=await db.from("teaching_sessions")
          .select("id,title,starts_at,duration_minutes,lesson_note,status,workplace_id,group_id,student_id,updated_at")
          .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
        if (error) throw new CoachError("DATABASE_ERROR",500,"Lesson lookup failed");
        if (!data) return {error:{code:"NOT_FOUND",message:"Lesson not found"}};
        return {data:{...data,participants:await sessionsParticipants(db,teacherId,id)}};
      }
      case "ccp_v1_workplaces_list":
        return { data: await workplacesList(db, teacherId) };
      case "ccp_v1_students_search": {
        const a = args as {query:string};
        const result = await teacherStudentsRoster(db,teacherId,{query:a.query,includeArchived:true,limit:100});
        const rows = result.students;
        const norm = (v:string) => v.normalize("NFC").toLocaleLowerCase();
        const exact = rows.filter(row => norm(row.name)===norm(a.query) ||
          (row.name_aliases as string[]).some(alias=>norm(alias)===norm(a.query)));
        if (exact.length > 1) return {error:{code:"NEEDS_RESOLUTION",
          message:"Multiple students share this name or alias. Ask for a stable student ID.",
          candidates:exact.map(row=>({id:row.id,name:row.name}))}};
        return {data:rows.map(safeStudentProfile)};
      }
      case "ccp_v1_groups_list":
        return { data: await groupsList(db, teacherId) };
      case "ccp_v1_groups_members":
        return { data: await groupsMembers(db, teacherId, (args as {groupId:string}).groupId) };
      case "ccp_v1_sessions_list": {
        const a = args as {query?:string;workplaceId?:string};
        const sessions = await sessionsList(db, teacherId);
        const filtered = sessions?.filter((s: {title:string;workplace_id:string}) =>
          (!a.workplaceId || s.workplace_id === a.workplaceId) &&
          (!a.query || s.title.toLocaleLowerCase().includes(a.query.toLocaleLowerCase()))) ?? [];
        if (a.query) {
          const exact = filtered.filter((s: {title:string}) =>
            s.title.toLocaleLowerCase() === a.query!.toLocaleLowerCase());
          if (exact.length > 1) return { error: { code: "NEEDS_RESOLUTION",
            message: "Multiple sessions match. Choose by date, workplace and stable ID.",
            candidates: exact.map((s: {id:string;title:string;starts_at:string}) =>
              ({ id: s.id, title: s.title, startsAt: s.starts_at })),
          } };
        }
        const ids = filtered.map((s: {id:string}) => s.id);
        const { data: revisions, error } = ids.length
          ? await db.from("teaching_sessions").select("id,updated_at").eq("teacher_id", teacherId).in("id", ids)
          : { data: [], error: null };
        if (error) throw new Error("revision read failed");
        const revisionById = new Map((revisions ?? []).map((r: {id:string;updated_at:string}) => [r.id,r.updated_at]));
        return { data: filtered.map((s: {id:string}) => ({ ...s, revision: revisionById.get(s.id) })) };
      }
      case "ccp_v1_sessions_participants":
        return { data: await sessionsParticipants(db, teacherId, (args as {sessionId:string}).sessionId) };
      case "ccp_v1_attendance_preview": {
        const sid = (args as {sessionId:string}).sessionId;
        const [roster, register] = await Promise.all([
          sessionsParticipants(db, teacherId, sid),
          attendanceList(db, teacherId, sid),
        ]);
        return { data: { sessionId: sid, participants: roster, attendance: register,
          requiresConfirmation: true, bulkCommitAvailable: false } };
      }
      case "ccp_v1_attendance_record": {
        const a=args as {sessionId:string;studentId:string;status:string;note:string;
          expectedUpdatedAt:string;idempotencyKey:string};
        return {data:await attendanceRecord(db,teacherId,{
          ...a,requestId:a.idempotencyKey,
        })};
      }
      case "ccp_v1_sessions_note_update": {
        const a=args as {sessionId:string;lessonNote:string;expectedUpdatedAt:string;idempotencyKey:string};
        const updated=await sessionsUpdate(db,teacherId,a.sessionId,{
          lessonNote:a.lessonNote,expectedUpdatedAt:a.expectedUpdatedAt,
          requestId:a.idempotencyKey,
        });
        return {data:{operation:"sessions.note.update",sessionId:a.sessionId,
          revision:updated.updated_at,idempotencyKey:a.idempotencyKey}};
      }
    }
    return { error: { code: "NOT_FOUND", message: "Unknown tool" } };
  } catch (error) {
    if (error instanceof TrainingPlanError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CoachBriefingError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof UnifiedHistoryError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof MaterialDefaultError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof AssignmentServiceError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof MaterialCatalogError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof MaterialHistoryError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof SpreadsheetImportError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof TeacherTransferError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof ManualPaymentError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CreditServiceError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof ConnectionError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof InvoiceSendPreviewError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof InvoiceActionError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof TeacherBillingError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof TeacherProfileError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CalendarFeedTokenError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof TeacherEventError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof LegacyAttendanceError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CalendarError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof GuardianServiceError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof LichessPuzzleError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof ImageFenError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof LichessConnectionError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof TeacherSkillsError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof StudentProfileError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof SessionRosterCorrectionError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CoachError)
      return { error: { code: error.code, message: error.message } };
    return { error: { code: "DATABASE_ERROR", message: "Operation failed" } };
  }
}
