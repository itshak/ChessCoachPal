import "server-only";
import { z } from "zod";
import {ratingRecordSchema,ratingFetchSchema,ratingListSchema} from "@/lib/chess-public-ratings";
import {ratingRefreshCommitSchema,teacherStudentRatingHistory,
 teacherStudentRatingRecord,teacherStudentRatingRefreshPreview,
 teacherStudentRatingRefreshCommit,StudentRatingError} from "@/lib/server/student-rating-snapshots";
import {studyPreferenceListSchema,studyPreferenceResolveSchema,studyPreferenceSetSchema,
 teacherStudyPreferencesList,teacherStudyPreferenceResolve,teacherStudyPreferenceSet,
 StudyPreferenceError} from "@/lib/server/teacher-study-preferences";
import {studyIndexSearchSchema,studyIndexGetSchema,studyIndexSyncSchema,
 teacherStudyIndexSearch,teacherStudyIndexGet,teacherStudyIndexSync,
 StudyIndexError} from "@/lib/server/teacher-study-index";
import {atomicLessonChapterCommitSchema,teacherAtomicLessonChapterCommit,
 AtomicLessonChapterError} from "@/lib/server/atomic-lesson-chapter";
import {lessonChapterPreviewSchema,lessonChapterCommitSchema,
 teacherLessonChapterPreview,teacherLessonChapterCommit,
 ChapterEvidenceError} from "@/lib/server/lesson-chapter-evidence";
import {puzzleSeriesCreateSchema,puzzleSeriesReconcileSchema,puzzleCapacitySchema,
 teacherPuzzleSeriesList,teacherPuzzleStudyCapacity,teacherPuzzleSeriesCreate,
 teacherPuzzleSeriesReconcile,PuzzleSeriesError} from "@/lib/server/puzzle-study-series";
import {PuzzleReviewError} from "@/lib/lichess-puzzles";
import {teacherFenValidate} from "@/lib/server/fen-validation";
import {teacherContextGet} from "@/lib/server/teacher-context";
import {completedGroupCaptureSchema,teacherCompletedGroupCapture,CompletedGroupCaptureError}
 from "@/lib/server/teacher-completed-group-capture";
import {materialInLessonPreviewSchema,materialInLessonCommitSchema,
 teacherMaterialInLessonPreview,teacherMaterialInLessonCommit,MaterialInLessonError}
 from "@/lib/server/teacher-material-in-lesson";

import {spreadsheetSuggestMcpSchema} from "@/lib/spreadsheet-suggest";
import {creditAdjustmentCommitSchema,creditAdjustmentPreviewSchema,
 teacherCreditAdjustmentPreview,teacherCreditAdjustmentCommit}
 from "@/lib/server/credit-adjustments";
import {lifecyclePreviewSchema,lifecycleCommitSchema,
 studentLifecyclePreview,studentLifecycleCommit}
 from "@/lib/server/student-lifecycle-service";
import {bulkLifecyclePreviewSchema,bulkLifecycleCommitSchema,
 teacherBulkLifecyclePreview,teacherBulkLifecycleCommit,BulkLifecycleError}
 from "@/lib/server/teacher-bulk-lifecycle";
import {historicalInputSchema,historicalCommitSchema,historicalReportSchema,
 teacherHistoricalAttendancePreview,teacherHistoricalAttendanceCommit,
 teacherHistoricalAttendanceReport,teacherHistoricalAttendanceSummary} from "@/lib/server/teacher-historical-attendance";
import {teacherHistoricalStageInfo,teacherHistoricalStageDelete,HistoricalImportError}
 from "@/lib/server/teacher-historical-stage";
import {historicalDatesInputSchema,historicalDatesCommitSchema,
 teacherHistoricalDatesPreview,teacherHistoricalDatesCommit}
 from "@/lib/server/teacher-historical-attendance-dates";
import {teacherCsvExport} from "@/lib/server/teacher-csv-export";

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
  CoachError, attendanceList, attendanceRecord, attendanceBulkRecord, groupsList, groupsMembers,
  sessionsList, sessionsParticipants, sessionsAdHocCreate, sessionsUpdate, sessionsComplete,
  studentsSearch, workplacesList, workplacesEnrollments, workplacesUnenroll,
  workplacesUnenrollPreview,
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
import {lessonCompletionSchema,attendanceBulkRecordSchema,type LessonCompletionInput} from "@/lib/lesson-completion";
import {lessonCapturePreviewSchema,teacherLessonCapturePreview,studentNamesResolveSchema,teacherStudentNamesResolve,LessonCapturePreviewError} from "@/lib/server/lesson-capture-preview";
import {archivedLessonRecoveryPreviewSchema,archivedLessonRecoveryCommitSchema,
 teacherArchivedLessonRecoveryPreview,teacherArchivedLessonRecoveryCommit}
 from "@/lib/server/archived-lesson-recovery";
import {LessonTimingError,scheduleDayPreviewSchema,teacherScheduleDayPreview} from "@/lib/server/lesson-schedule-inference";
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
import { createStudentWithOptionalContact } from "@/lib/server/teacher-student-create-service";
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
import {
 contactCreateSchema,contactUpdateSchema,studentContactLinkSchema,
 studentContactUnlinkSchema,billingAccountCreateSchema,billingAccountUpdateSchema,
} from "@/lib/server/contact-schemas";
import {
 contactsList,contactDetail,contactCreate,contactUpdate,safeContact,contactStudentLinksList,
 studentContactsList,studentContactLink,studentContactUnlink,
 billingAccountsList,billingAccountDetail,billingAccountCreate,billingAccountUpdate,
 safeBillingAccount,ContactServiceError,
} from "@/lib/server/teacher-contacts-service";
import {portalGrantCreateSchema,portalGrantRevokeSchema} from "@/lib/server/portal-grant-schemas";
import {teacherPortalGrantsList,teacherPortalGrantGet,
 teacherPortalGrantCreate,teacherPortalGrantRevoke,PortalGrantError}
 from "@/lib/server/portal-grants-service";
import {portalEventInviteCreateSchema,portalEventInviteRevokeSchema,
  teacherPortalEventInvitesList,teacherPortalEventInviteCreate,
  teacherPortalEventInviteRevoke} from "@/lib/server/portal-event-invitations";
import {
 compensationAgreementCreateSchema,compensationAgreementUpdateSchema,
 compensationPreviewSchema,compensationAgreementsList,compensationAgreementGet,
 compensationAgreementCreate,compensationAgreementUpdate,
 compensationAgreementPreview,CompensationAgreementError,
} from "@/lib/server/compensation-agreements-service";
import {
 financialObligationApproveSchema,receivedPaymentRecordSchema,
 paymentAllocationSchema,financialReversalSchema,
 financeLedgerList,financialObligationApprove,receivedPaymentRecord,
 paymentAllocate,financialReverse,FinanceLedgerError,
} from "@/lib/server/finance-ledger-service";
import {
 federationStudentSummary,federationMembershipCreate,federationMembershipUpdate,
 federationManualRatingRecord,federationDefaultGet,federationDefaultSet,
 federationDefaultUpdateSchema,federationMembershipCreateSchema,
 federationMembershipUpdateSchema,federationManualRatingSchema,FederationError,
} from "@/lib/server/student-federations-service";
import {
 payerAssignmentCreateSchema,payerAssignmentEndSchema,payerAssignmentListSchema,
 payerAssignmentsList,payerAssignmentCreate,payerAssignmentEnd,PayerAssignmentError,
} from "@/lib/server/student-billing-assignments-service";
import {workplaceContextUpdateSchema,teacherWorkplaceContextGet,
  teacherWorkplaceContextSet,WorkplaceContextError}
  from "@/lib/server/teacher-workplace-context";
import {canonicalMakeupCreditsList} from "@/lib/server/canonical-makeup-service";
import {sessionNotesList,sessionNoteSave,SessionNoteError,
 type SaveSessionNoteInput} from "@/lib/server/canonical-session-notes";

import {canonicalAttendanceList,canonicalAttendanceSet,canonicalAttendanceBulkSet,
 CanonicalAttendanceError,type CanonicalAttendanceSetInput,
 type CanonicalAttendanceBulkInput} from "@/lib/server/canonical-session-attendance";
import {canonicalSlotsList,canonicalSlotCreate,canonicalSlotUpdate,canonicalSlotDelete,
 canonicalSlotCreateSchema,canonicalSlotEditSchema,canonicalSlotDeleteSchema,CanonicalSlotError}
 from "@/lib/server/canonical-slot-service";
import {canonicalPrivateSessionCreate,canonicalPrivateSessionCreateSchema,
 CanonicalPrivateSessionError,type CanonicalPrivateSessionCreateInput}
 from "@/lib/server/canonical-private-session-service";
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
 businessName:z.string().max(120).optional(),
 businessWebsite:z.string().max(300).optional(),
 businessContact:z.string().max(300).optional(),
 businessInfo:z.string().max(5000).optional(),
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
 bccContactEmails:z.boolean().optional(),
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
    name: "ccp_workplaces_list",
    description: "List the connected teacher's workplaces with stable owned IDs. For historical attendance date imports, verify the workplace ID for the batch; never guess workplace names or create a workplace from an unverified source label. This is the delegated MCP equivalent of the teacher website workplaces.list read used by historical import; both share the owner-scoped workplace service.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_dashboard_summary",
    description: "Read the same teacher-owned student/workplace/group and last-seven-day session totals as the website dashboard.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_notifications_list",
    description: "Read the 30 most recent teacher notifications and unread count, exactly as on the website.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_notifications_mark_read",
    description: "Mark a specific notification ID or all of the teacher's unread notifications as read. Confirm before modifying notification state.",
    schema: z.object({
      id: uuid.optional(), all: z.literal(true).optional(),
    }).strict().refine(v => v.all === true || !!v.id, "id or all required"),
    scope: "coach:write", readOnly: false,
  },
  {
    name:"ccp_lessons_history_unified",
    description:"Read bounded lesson history using original recorded workplace and each lesson's saved local timezone. Omit workplaceId to inherit the active global filter, use null for explicit All Workplaces, or provide an owned UUID. Optional studentId is applied to the frozen session roster.",
    schema:unifiedLessonFilter,
    scope:"coach:read",readOnly:true,
  },
  {
    name: "ccp_reports_workplace_summary",
    description: "Read date-range sessions and attendance totals through the same website service. Omit workplaceId to inherit the active global filter; null means All Workplaces, or provide an owned UUID. Dates use saved local lesson zones, and each lesson is counted once. Optional CSV/TXT exports contain no learner names or notes.",
    schema: z.object({
      workplaceId: uuid.nullable().optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      format: z.enum(["json", "csv", "text"]).default("json"),
      outputLocale:z.enum(["en","he","ru"]).optional(),
    }).strict(),
    scope: "coach:read", readOnly: true,
  },
  {
    name:"ccp_billing_generation_preview",
    description:"Preview billable lesson charges, travel fees and prepaid-credit impact for one date period without creating invoices. Review totals and missing-rate warnings before commit.",
    schema:z.object({periodStart:z.string().date(),periodEnd:z.string().date()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_billing_generation_commit",
    description:"Generate draft invoices and consume eligible prepaid credits in one transaction. Explicit confirmation required. Supply and reuse idempotencyKey on website/MCP retries to get the same immutable invoice IDs without recharging credits.",
    schema:z.object({periodStart:z.string().date(),periodEnd:z.string().date(),
      confirmed:z.literal(true),idempotencyKey:uuid.optional()}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_invoice_regenerate",
    description:"Recalculate a draft invoice from attendance, rates and credits with a database transaction, optimistic revision and immutable retry receipt. Review the current invoice first and reuse expectedUpdatedAt plus idempotencyKey across retries. Explicit confirmation required.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true),
      expectedUpdatedAt:z.string().datetime({offset:true}).optional(),
      idempotencyKey:uuid.optional()}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_invoice_pdf",
    description:"Generate an owned invoice PDF in base64 without sending it. Requires teacher confirmation because invoice PDFs can contain family personal information. For large files use secure website download.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_billing_invoice_checkout",
    description:"After explicit teacher approval, initiate a Stripe checkout link for the remaining balance on one invoice. Never charge a card directly; the family completes payment securely in Stripe's browser checkout.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true),
      confirmedExternal:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_invoices_bulk_preview",
    description:"Review up to 50 teacher-owned draft invoices with current amounts, email recipients and a revision fingerprint. Requires confirmed=true to reveal family emails. Read-only; no email is sent.",
    schema:z.object({ids:z.array(uuid).min(1).max(50),
      includeRecipients:z.boolean().default(false),confirmed:z.literal(true).optional()}).strict()
      .refine(v=>!v.includeRecipients||v.confirmed===true,
        "Viewing family recipients requires explicit approval"),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_billing_invoices_bulk",
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
    name:"ccp_students_bulk_lifecycle_preview",
    description:"Preview archive/reactivation for identified students and exact revisions. Archiving requires removing current enrollment first; current enrollment removal does NOT preserve last workplace history yet. For reactivation, ask which workplace the student is returning to; never infer current enrollment from historical attendance. Preview also checks commitments and hosted quota.",
    schema:bulkLifecyclePreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_students_bulk_lifecycle_commit",
    description:"Commit reviewed archive/reactivation by digest, revision and approval. IMPORTANT: reactivation changes student status only and DOES NOT automatically restore workplace enrollment. Ask teacher to confirm destination workplace and enroll explicitly; do not report return-to-workplace completed until enrollment receipt exists. SQL rechecks tenant, commitments, quota and replay.",
    schema:bulkLifecycleCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_historical_import_upload_handoff",
    description:"Receive the secure ChessCoachPal browser upload URL for staging a large historical spreadsheet. Do not send raw private student file bytes or a base64 file through MCP. Upload from the signed-in website and then supply the resulting short-lived stageId.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_historical_import_stage_info",
    description:"Check ownership, expiry, file size and digest of an already uploaded private spreadsheet by stageId; no raw student/file content returned.",
    schema:z.object({stageId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_historical_import_stage_delete",
    description:"After confirmation, delete the teacher-owned private staged spreadsheet and stage reference. Does not delete committed historical evidence.",
    schema:z.object({stageId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_historical_attendance_dates_preview",
    description:"For verified PAST attended dates, preview 1–250 source-attested ISO dates per teacher-owned student under ONE verified workplace and IANA timezone; use ccp_workplaces_list and exact student names/IDs. NOT for normal scheduled/completed lessons or student/family CSV imports. Never guess dates from V/X/blank marks or totals. Returns issues and a digest without writing; after approval use ccp_historical_attendance_dates_commit. For absences/aggregates use advanced ccp_historical_attendance_preview; no teaching hours or mastery inferred.",
    schema:historicalDatesInputSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_historical_attendance_dates_commit",
    description:"Commit a previously previewed ccp_historical_attendance_dates_preview request only after explicit teacher approval. Repeat EXACT preview inputs and append previewDigest, confirmed:true, and fresh idempotencyKey UUID. Atomic, owner-scoped, duplicate-safe historical evidence; does not create calendar lessons or teaching durations.",
    schema:historicalDatesCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_historical_attendance_preview",
    description:"ADVANCED mapped historical import for aggregate/absence/mixed rows or private staged files, NOT the preferred source-neutral date-list importer. Mapping format is targetField -> exact source column header, with camelCase targets: {studentName:'Student Name',workplaceId:'Workplace ID',attendedOn:'Lesson Date',attendanceStatus:'Status'}. Do not use snake_case roster-import suggestions or map a date-matrix heading directly. For plain student plus real attended dates use ccp_historical_attendance_dates_preview instead. Ambiguous, missing or duplicate records block import. Large files use short-lived private stageId; direct rows up to 250 / 256 KiB.",
    schema:historicalInputSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_historical_attendance_commit",
    description:"Atomically import previously reviewed historical evidence only, never fabricated sessions; requires exact previewDigest, request UUID, confirmation, owned student/workplace IDs, and no ambiguity.",
    schema:historicalCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_historical_attendance_report",
    description:"Read tenant-scoped dated and aggregate-only historical attendance evidence with source-row provenance. Dated observations and aggregate counts are reported separately and never counted as fabricated calendar sessions.",
    schema:historicalReportSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_historical_attendance_summary",
    description:"Read complete, owner-scoped dated-observation and aggregate-only lesson counts by optional student and/or workplace. Distinct from ordinary calendar sessions; no inferred dates, attendance or mastery.",
    schema:z.object({studentId:uuid.optional(),workplaceId:uuid.optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_import_spreadsheet_parse",
    description:"Parse a teacher-supplied CSV/XLSX spreadsheet provided as base64 without writing data. Return proposed mapping and a preview. Max file size 2 MB.",
    schema:z.object({filename:z.string().trim().min(1).max(120),
      base64:z.string().min(1).max(3000000)}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_import_spreadsheet_preview",
    description:"Preview normalized student/family import rows using a selected column mapping before any database mutations.",
    schema:z.object({rows:z.array(z.record(z.string(),z.string())).max(500),
      mapping:z.record(z.string(),z.string().nullable())}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_import_spreadsheet_suggest",
    description:"Suggest source-header column mapping. Local deterministic heuristic by default; AI provider requires useAi=true and confirmedExternal=true because sample data is shared with the configured external AI.",
    schema:spreadsheetSuggestMcpSchema,
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_import_spreadsheet_commit",
    description:"Import reviewed students AND enroll them in a verified workplace atomically. Pass workplaceId explicitly when more than one workplace exists; otherwise the only workplace is selected. If WORKPLACE_REQUIRED is returned, ask the teacher to choose from workplaces and retry. Existing students gain the enrollment without duplication; historical attendance is separate.",
    schema:z.object({rows:z.array(z.record(z.string(),z.string())).min(1).max(500),
      mapping:z.record(z.string(),z.string().nullable()),confirmed:z.literal(true),
      idempotencyKey:uuid.optional(),workplaceId:uuid.optional()}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_settings_export",
    description:"Export teacher-owned chess academy data as portable JSON after explicit approval. Guardian portal credentials and provider secrets are NOT returned. Large backups require a secure browser download.",
    schema:z.object({confirmed:z.literal(true)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_settings_export_csv",
    description:"Portable ALL-DATA CSV export with privacy-filtered, per-table pagination. Call with {confirmed:true} and no table to list EVERY exported table and row count; then call with {confirmed:true,table:'students',offset:0,limit:100} (or each other listed table), repeat using nextOffset until null. Returns CSV text with header and UTF-8 data, not secrets/guardian portal credentials. The website can download every table in one ZIP at /api/settings/export?format=csv. Large raw data must never be sent in one MCP response.",
    schema:z.object({confirmed:z.literal(true),table:z.string().max(80).optional(),
      offset:z.number().int().min(0).max(20000).default(0),
      limit:z.number().int().min(1).max(200).default(100)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_settings_import_preview",
    description:"Preview a ChessCoachPal export without writing any data. Returns SHA-256, table counts, size and warnings. Review before any import.",
    schema:z.object({payload:z.unknown()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_settings_import_apply",
    description:"High-impact merge import into the teacher account. Require explicit confirmation and the exact SHA-256 digest from a reviewed preview. Existing records with matching IDs may be modified and some guardian portal links rotated.",
    schema:z.object({payload:z.unknown(),
      expectedSha256:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_manual_payment_record",
    description:"Record an actual full or partial manual payment on a saved draft or sent invoice. Draft payments never send email or publish to the family portal. Save on-screen draft edits first, check the balance, and confirm. Use one idempotencyKey per actual payment, reusing it only on retries.",
    schema:manualPaymentMcpSchema.extend({invoiceId:uuid}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_manual_payment_delete",
    description:"Correct one mistaken manual payment after confirmation. A paid never-sent invoice reopens privately as draft, while a previously sent invoice reopens as sent. Used prepaid credits must be reconciled first; Stripe payments need provider refunds.",
    schema:z.object({invoiceId:uuid,paymentId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_credits_packages_list",
    description:"Read prepaid packages, redeemed/pending balances, invoice status and expiration for an identified student or all coach-owned students.",
    schema:z.object({studentId:uuid.optional()}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_credits_package_create",
    description:"Sell prepaid credits for one student in one explicitly selected workplace and a verified effective-dated Billing Account, creating one draft invoice. No payment or email is sent. No payment or email is sent by this tool.",
    schema:creditPackageCreateSchema.extend({confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_credits_package_expiry",
    description:"Audited extension only: read package balance with ccp_credits_adjustment_preview, then supply expectedBalance, reason, durable requestId, confirmation. Cannot shorten or clear expiry.",
    schema:z.object({packageId:uuid,expiresOn:z.string().date(),
      expectedBalance:z.number().int().min(0),requestId:uuid,
      reason:z.string().trim().min(8).max(1000),
      confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_credits_redemption_return",
    description:"Return one identified used lesson credit to its prepaid package; changes what can be billed next. Teacher confirmation required.",
    schema:z.object({redemptionId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_connections_list",
    description:"List active authorized AI connector grants (client ID, scopes and timestamp only). Never reveal OAuth tokens or stored provider secrets.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_connections_revoke",
    description:"After explicit confirmation, immediately revoke one identified OAuth grant, possibly this very connection. The grant loses access to all MCP tools and token refresh.",
    schema:z.object({connectionId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_invoice_draft_update",
    description:"Atomically edit draft invoice lines and notes through a tenant-locked SQL transaction. Supply optional expectedUpdatedAt and immutable idempotencyKey for safe website↔MCP retries; changed payload or stale revision conflicts. Explicit teacher approval required.",
    schema:z.object({invoiceId:uuid,changes:invoiceDraftEditSchema,
      confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_invoice_void",
    description:"Atomically void an owned draft/sent invoice after confirmed teacher review. A request UUID supports cross-client replay; reject paid/partially paid invoices, active Stripe checkout, or issued prepaid credits instead of silently erasing value.",
    schema:z.object({invoiceId:uuid,idempotencyKey:uuid.optional(),
      confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_invoice_delete",
    description:"Permanently delete a draft or void invoice only after confirmation and reconciliation of existing payments and issued credit packages. Never silently erase received funds.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_invoice_send_preview",
    description:"Non-mutating invoice send preview for unsent drafts or never-sent paid invoices: PDF readiness, total, paid, outstanding balance and recipient summary. includeRecipients=true requires confirmed=true; never reveal portal tokens or Stripe URLs.",
    schema:z.object({invoiceId:uuid,includeRecipients:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict()
      .refine(a=>!a.includeRecipients||a.confirmed===true,"Email addresses require confirmation"),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_billing_invoice_send",
    description:"Explicitly send an unsent saved draft or a fully paid never-sent invoice PDF. An already-paid invoice stays paid; no further payment is requested. Partial invoices offer only the outstanding Stripe balance. Teacher email confirmation is required; never retry without checking delivery.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true),confirmedEmail:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_invoices_list",
    description:"List scoped invoices and their balances for this teacher, paginated. No portal tokens, checkout URLs or family email addresses.",
    schema:z.object({status:z.enum(["draft","sent","paid","void"]).optional(),
      offset:z.number().int().min(0).max(100000).default(0),
      limit:z.number().int().min(1).max(100).default(50)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_billing_invoice_detail",
    description:"Read one owned invoice with item and payment history. Family contacts and payment notes require includePrivate=true plus confirmation; portal tokens and Stripe secrets never returned.",
    schema:z.object({invoiceId:uuid,includePrivate:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_billing_payments_export",
    description:"Export accountant-facing CSV of teacher-owned payments in an optional YYYY-MM-DD period, including family names and payment notes. Requires explicit teacher confirmation; safely escapes CSV formulas.",
    schema:z.object({from:z.string().date().optional(),to:z.string().date().optional(),
      confirmed:z.literal(true)}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_teacher_settings_get",
    description:"Read teacher-owned studio rules, rates and billing settings with secrets redacted. Payment QR image bytes require includePaymentQrCode=true and explicit confirmation; Stripe credentials are never returned.",
    schema:z.object({
      includePaymentQrCode:z.boolean().default(false),
      confirmed:z.literal(true).optional(),
    }).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_teacher_credentials_handoff",
    description:"Start secure browser-only AI or Stripe credential entry without submitting any secret through the model. Returns the authenticated setup URL and current configured status; all raw keys must be entered directly into the website. Explicit teacher confirmation required.",
    schema:z.object({kind:z.enum(["ai","stripe"]),confirmed:z.literal(true)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_teacher_settings_update",
    description:"Edit studio rates, payment provider, approved payment QR and optional AI provider, or clear stored credentials with confirmation. New API keys and Stripe secrets remain browser-only secure inputs, never accepted through MCP.",
    schema:z.object({changes:studioPolicyPatch,confirmed:z.literal(true)}).strict()
      .refine(v=>Object.keys(v.changes).length>0,"Changes required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_events_list",
    description:"List teacher-owned class events and RSVP aggregates without exposing family contact details or tokens.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_events_detail",
    description:"Read an identified event and student roster; family RSVP notes require includeRsvps=true and explicit confirmation.",
    schema:z.object({eventId:uuid,includeRsvps:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_events_create",
    description:"Create an event for named students, with optional student repertoires, pending RSVPs and atomic idempotencyKey replay across website/MCP. DOES NOT email without a separate confirmed send tool.",
    schema:eventChanges.extend({title:z.string().trim().min(1).max(200),
      startsAt:z.string().datetime({offset:true}),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_events_update",
    description:"Edit an event and optionally REPLACE the whole student roster. Get the current event first, then explicitly confirm changed students and dates.",
    schema:eventChanges.extend({eventId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_events_delete_impact",
    description:"Preview an event's student roster and RSVPs before permanent deletion.",
    schema:z.object({eventId:uuid}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_events_delete",
    description:"Permanently delete an event and associated RSVP records only after explicit teacher confirmation.",
    schema:z.object({eventId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_events_portal_invitations_list",
    description:"List manually approved contact/student/workplace event invitations and response statuses for an owned event. Never return guest secret URLs or private RSVP notes.",
    schema:z.object({eventId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_events_portal_invitations_create",
    description:"Invite one explicitly shared portal contact to a workplace-scoped future event. The student must be in the event roster, the grant must have event_rsvp permission, and teacher confirmation is required. Does NOT send an email.",
    schema:portalEventInviteCreateSchema.extend({eventId:uuid}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_events_portal_invitations_revoke",
    description:"Revoke one specific event invitation without changing the event or other grant recipients. Exact revision, idempotency and teacher confirmation required.",
    schema:portalEventInviteRevokeSchema.extend({eventId:uuid,inviteId:uuid}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_reports_student_progress",
    description:"Read factual teacher-attested student progress: 1–10 strength, optional chess platform ratings, latest skill assessments with assessment counts, and full non-voided material evidence coverage. No inferred mastery or guardian/private notes.",
    schema:z.object({studentId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_account_security_handoff",
    description:"Open the signed-in website to change login email, password or multi-factor authentication using provider-secured reauthentication. MCP never sees credentials, recovery codes or MFA secrets.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_hosted_subscription_handoff",
    description:"Review the authoritative account plan and active capacity shown on the website Account and Students pages. Browser-only checkout is not offered until a verified provider and approved subscription are configured.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_teacher_federation_default_get",
    description:"Read the teacher's suggested national chess federation code, if configured. This is only a preference: it does not imply any pupil is registered.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_teacher_federation_default_set",
    description:"Explicitly confirm a change to the teacher's suggested national federation, CAS-guarded against another tab. Never create student membership or verified data from a default.",
    schema:federationDefaultUpdateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_student_billing_assignments_list",
    description:"List exact student/workplace historical payer assignment decisions. Never infer a payer from contact, guardian status, family, enrollment, or portal grant.",
    schema:payerAssignmentListSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_student_billing_assignments_create",
    description:"After explicit teacher approval, assign one owned active billing account to exactly one owned enrolled student and workplace for an inclusive effective-dated period. Overlaps are prohibited; does NOT create a debt, invoice, receipt, payment or portal grant.",
    schema:payerAssignmentCreateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_student_billing_assignments_end",
    description:"End one exact student payer period on a confirmed effective date with optimistic revision and idempotency. The old assignment remains for historic lessons, never silently retroactively rebills.",
    schema:payerAssignmentEndSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_student_federations_get",
    description:"Read optional FIDE ID, FIDE federation, national federation suggestion (not membership), registered national IDs and immutable FIDE/Israeli rating evidence for one owned learner. Teacher-entered records are unverified and never change 1–10 assessed strength.",
    schema:z.object({studentId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_student_federations_link",
    description:"After explicit teacher confirmation, record one optional national federation player ID on the exact student as UNVERIFIED. A teacher default federation is only a form suggestion; no account match, membership or public search is inferred.",
    schema:federationMembershipCreateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_student_federations_update",
    description:"Revise the exact owned national federation player ID with revision check and idempotency. A changed ID loses prior verification until a compliant provider check is performed.",
    schema:federationMembershipUpdateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_student_federation_ratings_record",
    description:"Teacher-confirmed manual FIDE Standard/Rapid/Blitz or Israeli national rating observation with source URL/date. Stored immutably as UNVERIFIED teacher evidence; never claim official verification or change student strength/mastery.",
    schema:federationManualRatingSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_compensation_agreements_list",
    description:"Read owner-scoped effective-dated professional compensation terms. Coach expected earnings and participant charges are different policies; no payment, invoice or obligation is posted. Optional workplace filter and archived terms.",
    schema:z.object({workplaceId:uuid.optional(),includeArchived:z.boolean().default(false)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_compensation_agreements_get",
    description:"Read one teacher-owned professional compensation agreement by exact ID, revision, currency, scope and validity dates. Does not disclose finance credentials.",
    schema:z.object({agreementId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_compensation_agreements_create",
    description:"After explicit teacher approval, create one agreement for instructor earnings or one customer billing scope. Name the exact owned workplace, model, minor-unit rate, explicitly owned billing-account counterparty for both coach earnings and charges, effective dates; ambiguous overlapping agreements are rejected. No cash or invoice is created.",
    schema:compensationAgreementCreateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_compensation_agreements_update",
    description:"Confirm an effective-dated rate or status amendment with exact revision and idempotency; updates cannot retroactively rewrite issued invoices or verified financial history.",
    schema:compensationAgreementUpdateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_compensation_agreements_preview",
    description:"Read-only deterministic expected coach compensation for verified completed canonical sessions, one group session counted once. Never claim cash received, compliance, invoice issuance or missing lessons as completed; fixed monthly agreements require full calendar months.",
    schema:compensationPreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_finance_ledger_list",
    description:"Read up to 100 latest teacher-owned immutable financial obligations, confirmed manual receipts, explicit allocations and correction/refund entries. Net paid balances depend on reversals; this is not an issued invoice or official tax receipt.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_finance_obligation_approve",
    description:"Explicitly approve one frozen teacher-owned session or complete-month obligation against an exact agreement revision, amount, specific payer and canonical attendance. Reject stale rate, unconfirmed pupil, duplicate coach time or invented cash. Replay safely with idempotency.",
    schema:financialObligationApproveSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_finance_payment_record",
    description:"After teacher confirms real received money, record a manual cash/bank/card/other receipt from an explicitly owned Billing Account; this NEVER initiates or verifies a card charge, creates an invoice, or marks any obligation paid without allocation.",
    schema:receivedPaymentRecordSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_finance_allocation_record",
    description:"Teacher-approved partial/full allocation of an existing actual received payment to one immutable obligation from the same payer/currency, with transactionally enforced remaining balances and idempotency. Never generate receipt money from lessons.",
    schema:paymentAllocationSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_finance_reversal_record",
    description:"Append an explicitly approved reversal of an allocation, a confirmed manual refund event, or an unsettled obligation correction with precise source ID, amount, reason and idempotency. Original postings remain immutable; no external refund is initiated.",
    schema:financialReversalSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_workplace_context_get",
    description:"Read the teacher's global filter and active owned workplaces. If its previous workplace is unavailable, the effective selection is null (All Workplaces) with selectionWasStale=true. This is a filter, not an access grant or a historical data change.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_workplace_context_set",
    description:"Confirm a global filter change to an active owned workplace UUID or null (All Workplaces). Set expectedSelectedWorkplaceId from the latest GET, including null for an archived-workplace fallback; it can be safely replaced or cleared. Re-read on stale conflicts. No students, lessons or financial history are reassigned.",
    schema:workplaceContextUpdateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_teacher_profile_get",
    description:"Read this coach's display name, preferred UI language (en/he/ru) and avatar without credentials or email. Answer in the teacher's requested language.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_teacher_profile_update",
    description:"Update display name, preferredLocale (en/he/ru) or approved avatar after confirmation. Language changes UI and conversational defaults, not teaching data. Password, login email and MFA remain browser-secured.",
    schema:z.object({
      displayName:z.string().trim().min(1).max(200).optional(),
      avatarUrl:z.string().url().max(2048).nullable().optional(),
      preferredLocale:z.enum(["en","he","ru"]).optional(),
      confirmed:z.literal(true),
    }).strict().refine(a=>a.displayName!==undefined||a.avatarUrl!==undefined||a.preferredLocale!==undefined,"No profile changes"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_calendar_feed_status",
    description:"Check whether this teacher has an active calendar feed. Never returns the bearer link or token.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_calendar_feed_rotate",
    description:"After explicit teacher confirmation, revoke the old calendar feed and generate a new link. The old link immediately stops working. The new secret is only available to the signed-in website, never to MCP.",
    schema:z.object({confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_events_email_preview",
    description:"Preview exactly the event invitation subject/body and intended recipient counts, with no email sent. Add includeRecipients=true plus confirmed=true to reveal addresses. Never returns family portal tokens or URLs.",
    schema:z.object({eventId:uuid,includeRecipients:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict()
      .refine(a=>!a.includeRecipients||a.confirmed===true,
        "Recipient contact details require explicit confirmation"),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_events_email_invites",
    description:"Explicit external action: email event invitations to participating families. Requires confirmation; no automatic emails on create or edit.",
    schema:z.object({eventId:uuid,confirmed:z.literal(true),confirmedEmail:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_session_attendance_list",
    description:"Read canonical frozen-roster attendance. Unmarked participants are explicit; cancellation notice/initiator and immutable revision are included.",
    schema:z.object({sessionId:uuid}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_session_attendance_set",
    description:"Confirmed canonical per-student attendance mark, correction or clear. Owner-scoped frozen roster, expected revision and idempotency key are mandatory; family notification requires separately confirmed consent.",
    schema:z.object({sessionId:uuid,studentId:uuid,
      status:z.enum(["present","late","absent","excused","student_cancelled","teacher_cancelled"]).nullable(),
      note:z.string().max(5000).default(""),
      noticeAt:z.string().datetime({offset:true}).nullable(),
      cancelReason:z.string().max(1000).default(""),
      expectedUpdatedAt:z.string().datetime({offset:true}).nullable(),
      idempotencyKey:uuid,notifyFamily:z.boolean().default(false),
      confirmedEmail:z.literal(true).optional(),confirmed:z.literal(true),
    }).strict().refine(x=>!x.notifyFamily||
      (x.status==="teacher_cancelled"&&x.confirmedEmail===true),
      "Family email requires explicit confirmation"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_session_attendance_bulk_set",
    description:"Commit 1-50 canonical participant attendance changes atomically. Any stale row rolls back the entire group and all notifications and replay receipts.",
    schema:z.object({sessionId:uuid,idempotencyKey:uuid,
      attendance:z.array(z.object({studentId:uuid,
        status:z.enum(["present","late","absent","excused","student_cancelled","teacher_cancelled"]).nullable(),
        note:z.string().max(5000).default(""),
        noticeAt:z.string().datetime({offset:true}).nullable(),
        cancelReason:z.string().max(1000).default(""),
        expectedUpdatedAt:z.string().datetime({offset:true}).nullable(),
        notifyFamily:z.boolean().default(false),
        confirmedEmail:z.literal(true).optional(),confirmed:z.literal(true),
      }).strict()).min(1).max(50),confirmed:z.literal(true),
    }).strict().refine(x=>x.attendance.every(r=>!r.notifyFamily||
      (r.status==="teacher_cancelled"&&r.confirmedEmail===true)),
      "Every family email requires explicit confirmation"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_canonical_makeup_credits_list",
    description:"Read available, unredeemed make-up credits from canonical frozen student attendance, subject to the studio cancellation and expiry policy. A make-up session is created with ccp_canonical_private_session_create and makeupForSessionId.",
    schema:z.object({}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_session_notes_list",
    description:"List canonical shared/private session and participant teaching notes. Teacher-private fields require includePrivate=true and confirmed=true. Frozen participant IDs are canonical student IDs.",
    schema:z.object({sessionId:uuid,includePrivate:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_session_notes_save",
    description:"Write one canonical session or participant note with optimistic revision, idempotency key, and audit. Family email needs explicit confirmedEmail and queues a durable approved intent; not immediate delivery.",
    schema:z.object({sessionId:uuid,studentId:uuid.nullable().optional(),
      body:z.string().max(10000),privateBody:z.string().max(10000),
      sharedWithContacts:z.boolean(),sendEmail:z.boolean().default(false),
      confirmedEmail:z.literal(true).optional(),
      expectedUpdatedAt:z.string().datetime({offset:true}).nullable(),
      idempotencyKey:uuid,confirmed:z.literal(true),
    }).strict().refine(x=>!x.sendEmail||
       (x.confirmedEmail===true&&!!x.studentId&&x.sharedWithContacts&&!!x.body.trim()),
        "Email requires explicit confirmation, participant and shared note"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_private_sessions_create",
    description:"Atomically schedule one canonical private/ad-hoc chess lesson or verified make-up. Optional durationMinutes (15–480) defaults to 30 minutes for ordinary sessions or the original length for make-ups; supply it to avoid surprise defaults. Local timezone/DST, ownership and enrollment are enforced; replays return the original session.",
    schema:canonicalPrivateSessionCreateSchema.extend({
      confirmed:z.literal(true),
    }).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_recurring_slots_list",
    description:"List owned canonical private recurring scheduling intentions, optionally filtered by active state or student. Includes revision updated_at.",
    schema:z.object({studentId:uuid.optional(),activeOnly:z.boolean().optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_recurring_slots_create",
    description:"Create one recurring canonical private lesson slot and materialize the next 56 studio-local days atomically. The supplied idempotencyKey is also the stable slot ID for exact website/MCP replay. Teacher-owned student and workplace enrollment required.",
    schema:canonicalSlotCreateSchema.extend({confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_recurring_slots_update",
    description:"Atomically correct a canonical recurrence rule, preserving billed/attended/noted/moved history and reconciling future unprotected sessions. Requires exact updatedAt and idempotency key; never erase history.",
    schema:canonicalSlotEditSchema.extend({slotId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_recurring_slots_delete",
    description:"Atomically delete only canonical scheduling intent. Future unprotected lessons may be removed; protected teaching records remain. Requires explicit confirmation and idempotency key.",
    schema:canonicalSlotDeleteSchema.extend({slotId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_contacts_list",
    description:"Find teacher-owned contact identities. Contacts are not portal audiences or payers. Email/phone are redacted in lists; select one by ID for confirmed details.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_contacts_detail",
    description:"Read one teacher-owned contact. To include email, phone and preferred language, specify includeDetails=true AND confirmed=true. Does not grant portal access.",
    schema:z.object({contactId:uuid,includeDetails:z.boolean().default(false),confirmed:z.literal(true).optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_contacts_links_list",
    description:"Read all explicitly recorded student relationships for one owned contact, including ended historical links, legal-guardian and messaging flags. No portal grants, private notes or payer obligations.",
    schema:z.object({contactId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_contacts_create",
    description:"Create one independent person/organization contact, without assigning lessons, student links, portal privileges or payment responsibility. Explicit teacher confirmation and UUID idempotency key required.",
    schema:contactCreateSchema.extend({confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_contacts_update",
    description:"Update identified contact fields with exact revision, idempotency and explicit teacher confirmation. Archiving does not erase history or grant access.",
    schema:contactUpdateSchema.safeExtend({contactId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_student_contacts_list",
    description:"Read contact links and independent role/communication flags for one owned student; never assume a contact can view private notes or invoices.",
    schema:z.object({studentId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_student_contacts_link",
    description:"Link an existing owned contact to exactly one owned student with explicit relationship, legal-guardian and messaging flags. Does not create debt or portal grants; require explicit confirmation.",
    schema:studentContactLinkSchema.extend({studentId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_student_contacts_unlink",
    description:"End one existing student-contact relationship without deleting the person or historic link; require correct revision, idempotency and teacher confirmation.",
    schema:studentContactUnlinkSchema.extend({studentId:uuid,linkId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_accounts_list",
    description:"List teacher-owned payer identities. Contact relationships do NOT establish a payer and no invoice is created by listing.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_billing_accounts_detail",
    description:"Read an identified payer account, with contactId only after explicit confirmed request. Reading never charges, invoices or shares anything.",
    schema:z.object({billingAccountId:uuid,includeContact:z.boolean().default(false),confirmed:z.literal(true).optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_billing_accounts_create",
    description:"Create an independent person/organization billing identity, optionally referring to an existing owned contact. Does NOT generate an invoice; require confirmation and idempotency key.",
    schema:billingAccountCreateSchema.extend({confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_billing_accounts_update",
    description:"Update an identified billing-account name, type, associated contact or active status; require expected revision, idempotency and explicit confirmation. Does not retroactively reassign invoices.",
    schema:billingAccountUpdateSchema.safeExtend({billingAccountId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_portal_grants_list",
    description:"List explicit scoped guest sharing metadata for the teacher. Each grant binds exactly one contact, student and workplace; never returns any link secret, token digest or unauthorized child data.",
    schema:z.object({contactId:uuid.optional(),studentId:uuid.optional()}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_portal_grants_get",
    description:"Read metadata and current revoke/expiry state of one teacher-owned portal grant; never disclose a secret link.",
    schema:z.object({grantId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_portal_grants_create",
    description:"With teacher confirmation create an explicit limited contact/student/workplace sharing grant, requiring exact permissions and expiration. This DOES NOT issue a secret URL. Use the authenticated website for link issuance; contact relationship alone is never a grant.",
    schema:portalGrantCreateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_portal_grants_revoke",
    description:"Explicitly revoke a scoped portal grant using expected revision and request ID. Invalidates any previously issued token; no secret or URL returned.",
    schema:portalGrantRevokeSchema.extend({grantId:uuid}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_skill_dimensions_list",
    description:"List teacher-owned 1–5 assessment dimensions; the website uses the same chess-specific dimensions.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_skill_dimensions_create",
    description:"Create a teacher-owned skill dimension after teacher approval; avoid duplicates.",
    schema:z.object({name:z.string().trim().min(1).max(120),requestId:uuid.optional(),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_skill_dimensions_update",
    description:"Rename one teacher-owned skill dimension while preserving assessments; confirm the name.",
    schema:z.object({dimensionId:uuid,name:z.string().trim().min(1).max(120),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_skill_dimensions_delete_impact",
    description:"Preview whether a skill dimension is unused and may be removed. Preserve all historic ratings.",
    schema:z.object({dimensionId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_skill_dimensions_delete",
    description:"Delete only an unused dimension with teacher approval and zero-assessment preview; rename used dimensions instead.",
    schema:z.object({dimensionId:uuid,expectedAssessmentCount:z.number().int().min(0),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_teacher_context_get",
    description:"Read trusted local date, timezone, workplaces and preferredLocale (en/he/ru). Answer in the explicit user message language, else preferredLocale. Preserve student names and chess notation.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_student_ratings_list",
    description:"Read append-only separately sourced chess platform rating snapshots (including time control, provisional status and fetch time). No values alter the teacher 1–10 strength.",
    schema:ratingListSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_student_ratings_record",
    description:"Teacher-confirmed append-only manual platform/time-control rating observation, idempotent by UUID. Does not infer account ownership or change teacher strength.",
    schema:ratingRecordSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_student_ratings_refresh_preview",
    description:"With confirmedExternal=true, send only the selected saved public chess username to the fixed Lichess or Chess.com API and show per-time-control provider observations. NO local write; public account ownership is unverified.",
    schema:ratingFetchSchema,scope:"coach:read",readOnly:false,
  },
  {
    name:"ccp_student_ratings_refresh_commit",
    description:"Explicitly confirm external public chess rating snapshot import. Refetch and compare exact preview digest; record a provider-sourced append-only batch with one UUID receipt, never change teacher strength.",
    schema:ratingRefreshCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_materials_preferences_list",
    description:"List teacher-owned saved Lichess study preferences with exact teacher/workplace/student scope and revision. A study link is not teaching evidence and never implies mastery; no OAuth token is exposed.",
    schema:studyPreferenceListSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_materials_preferences_resolve",
    description:"Resolve one saved Lichess study with deterministic student > workplace > teacher precedence and owner/enrollment checks, including cached index freshness. Explicit study overrides may still be selected in lesson preview; never guess an absent preference.",
    schema:studyPreferenceResolveSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_materials_preferences_set",
    description:"After explicit teacher approval, set or clear one Lichess lesson/puzzle study preference for an owned teacher/workplace/active student. Verify the indexed provider study for non-null edits, exact revision and UUID receipt; stale/foreign/replayed modified inputs fail closed. No provider write or inferred teaching evidence.",
    schema:studyPreferenceSetSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_materials_chapters_search",
    description:"Read tenant-owned cached Lichess study/chapter index by study, exact chapter ordinal or verified PGN tags White/Black/Event. Returns source freshness; cached chapters are not automatic teaching evidence.",
    schema:studyIndexSearchSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_materials_chapters_get",
    description:"Read one exact teacher-authorized Lichess study/chapter metadata pair, cached verification time and source URL. No raw private PGN or OAuth token.",
    schema:studyIndexGetSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_materials_chapters_sync",
    description:"With explicit external read permission, validate all chapter IDs from authorized Lichess study PGN then atomically replace a metadata-only tenant index. Requires study:read browser grant; no raw PGN persisted.",
    schema:studyIndexSyncSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_materials_link_preview",
    description:"Preview one exact fresh Lichess chapter linked to a canonical lesson's frozen roster: one instructor lesson, N separate student coverages. No write or inferred mastery.",
    schema:lessonChapterPreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_materials_link_commit",
    description:"Teacher-confirmed atomic lesson chapter link and per-student material evidence, bound to cached chapter revision, frozen roster hash and request UUID. Only completed lessons may be marked taught.",
    schema:lessonChapterCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_chess_fen_validate",
    description:"Read-only 6-field standard chess FEN structural/static legality validation, 8×8 board and explicit unknown image state; not a full move-engine certification or publishing action.",
    schema:z.object({fen:z.string().min(10).max(120),
      source:z.enum(["manual","image"]).default("manual")}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_puzzles_study_series_list",
    description:"List authorized named Puzzles series and pending local creation receipts, identify next private Puzzles N destination and explain Lichess's 30/day limit. Read only.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_puzzles_study_capacity",
    description:"Live authorize/read chapter count in one Lichess study, including the starter chapter. Refuse 64/64 capacity before external PGN writes.",
    schema:puzzleCapacitySchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_puzzles_study_create",
    description:"Explicit teacher-approved creation of a new private Puzzles/Puzzles N study with study:write grant, 30/day local budget, unique reserved suffix and never automatically retried provider intent.",
    schema:puzzleSeriesCreateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_puzzles_study_reconcile",
    description:"Read live provider studies to reconcile an ambiguous private Puzzles N creation by original UUID; never make a second remote POST.",
    schema:puzzleSeriesReconcileSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_lichess_connection_status",
    description:"Read teacher Lichess account username, study scopes and connection status. No provider credentials are accessible.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_lichess_image_fen_propose",
    description:"With explicit teacher consent, send a chessboard photo (PNG/JPEG/WebP, at most 2MB) to a teacher-configured external AI to PROPOSE a FEN. Images may contain personal information. This is an unverified draft, not a factual reconstruction or a publishing action. All 64 squares and game-state placeholders must be reviewed and corrected before a separate PGN preview and Lichess publication approval.",
    schema:imageFenInputSchema.extend({confirmed:z.literal(true)}).strict(),
    scope:"coach:read",readOnly:false,
  },
  {
    name:"ccp_lichess_puzzle_preview",
    description:"Review a teacher-supplied FEN and every solution SAN move with native GigaChess legality before returning an 8x8 board, a verified move-by-move continuation, and a SHA-256 Lichess import preview. Reject impossible/ambiguous continuations. NEVER publish; a photograph cannot prove its position or unknown game-state fields.",
    schema:puzzleDraftSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_lichess_puzzle_publish",
    description:"Publish one explicitly approved GigaChess-legality-validated puzzle continuation to Lichess. Requires separate study:write browser grant, unchanged preview SHA-256, new UUID receipt and external-write confirmation. Native SAN legality cannot be bypassed; provider timeouts are ambiguous and must be reconciled, not automatically retried.",
    schema:puzzlePublishSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_lichess_studies_search",
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
    name:"ccp_lichess_connect_handoff",
    description:"Return a secure browser URL to authorize Lichess study:read or study:write with OAuth PKCE. Optionally return to Account Settings or Training & Materials. No credentials enter MCP.",
    schema:z.object({
      mode:z.enum(["read","write"]).default("read"),
      returnTo:z.enum(["learning","account"]).default("learning"),
    }).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_lichess_connection_disconnect",
    description:"Disconnect/revoke the teacher's Lichess token only with explicit approval. Report provider revocation failures and manual action truthfully.",
    schema:z.object({confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_student_skill_assessments_list",
    description:"Page through complete timestamped 1–5 skill history for an owned student, including archived learners.",
    schema:z.object({studentId:uuid,limit:z.number().int().min(1).max(1000).default(1000),offset:z.number().int().min(0).max(1000000).default(0)}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_student_skill_assessments_record",
    description:"Append teacher-approved 1–5 skill assessments atomically, optionally backdated to an explicit coach-local assessedOn date (YYYY-MM-DD; not future). Supply the same idempotencyKey UUID on retries; replays retain the original date.",
    schema:z.object({studentId:uuid,ratings:z.array(z.object({
      dimensionId:uuid,rating:z.number().int().min(1).max(5),note:z.string().max(2000).optional(),
    }).strict()).min(1).max(20),assessedOn:z.string().date().optional(),idempotencyKey:uuid.optional(),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_students_roster",
    description: "Page through active learners by default, all learners with includeArchived=true, or only former pupils with archivedOnly=true. Includes chess profiles and revisions; excludes private notes and guardian contacts.",
    schema: z.object({query:z.string().trim().max(80).optional(),
      includeArchived:z.boolean().default(false),archivedOnly:z.boolean().default(false),
      offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(100).default(50)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name: "ccp_students_profile",
    description: "Read an identified student's profile. Private teacher notes and family/contact fields are excluded unless includePrivate=true AND confirmed=true. Avoid exposing children's information unnecessarily.",
    schema:z.object({studentId:uuid,includePrivate:z.boolean().default(false),confirmed:z.literal(true).optional()}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_students_chess_history",
    description:"Read teacher-entered 1-10 strength, goals, handles and provider/time-control rating changes; timestamps and old/new values are recorded, but no provider verification is implied.",
    schema:z.object({studentId:uuid,
      offset:z.number().int().min(0).max(100000).default(0),
      limit:z.number().int().min(1).max(100).default(50)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_students_delete_impact",
    description:"Read owner-scoped teaching, roster, material, progress and credit dependencies before permanent deletion. Prefer archive for historical students.",
    schema:z.object({studentId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_students_delete",
    description:"Permanently remove an unlinked student profile only with the reviewed revision and explicit teacher confirmation. Historical linked records block this action; archive instead.",
    schema:z.object({studentId:uuid,expectedUpdatedAt:instant,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_students_archive_preview",
    description: "Read the teacher-owned student's archival blockers (recurring slots, future private/group lessons, current group memberships) before requesting archival. No private notes or contacts are exposed.",
    schema:z.object({studentId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name: "ccp_students_profile_edit",
    description: "Edit one student's chess handles, aliases, strength (1-10), teacher-entered ratings, lesson rates, private notes and birthdate. Archiving/reactivation requires the separate reviewed ccp_students_lifecycle_preview and ccp_students_lifecycle_commit; this general profile tool cannot change lifecycle state. Reload after conflicts; never blindly retry.",
    schema:z.object({studentId:uuid,expectedUpdatedAt:instant,changes:studentUpdateSchema,
      confirmed:z.literal(true)}).strict().refine(v=>Object.keys(v.changes).length>0,"Changes required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_students_lifecycle_preview",
    description:"Preview an exact owned learner's current, future and previous workplace periods, recurring/future-session blockers and all remaining prepaid credits with funding/expiry. Required before archive or reactivation, never assume an old workplace is active.",
    schema:lifecyclePreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_students_lifecycle_commit",
    description:"Teacher-confirmed, idempotent atomic archive or reactivation with a stable student ID and exact expectedUpdatedAt from preview. Archiving closes current membership periods, cancels future periods and holds credits without refunds, but blocks unresolved groups, slots and future lessons. Reactivation creates ONLY explicitly selected previously verified workplace periods, never guesses lesson or credit activity.",
    schema:lifecycleCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_students_search",
    description: "Search only your teacher-owned students. If NEEDS_RESOLUTION is returned ask the teacher which ID they mean before writing.",
    // Unlike ID-directed search inputs, an empty query means an owner-scoped
    // roster browse. The website's students.search permits this too.
    schema: z.object({ query: z.string().trim().max(80).default("") }).strict(),
    scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_groups_list",
    description: "List teacher-owned class groups and their workplace IDs.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_groups_members",
    description: "Get the current group members; for past lessons prefer the frozen session participant roster.",
    schema: z.object({ groupId: uuid }).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_sessions_list",
    description: "Find sessions, their revision timestamp and their existing topic note. Omit query for recent sessions; ambiguity returns NEEDS_RESOLUTION.",
    schema: z.object({
      query: searchText.optional(), workplaceId: uuid.optional(),
    }).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_sessions_participants",
    description: "List a session's frozen participant roster and student IDs, even after group membership changes.",
    schema: sessionId, scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_attendance_preview",
    description: "Read current attendance of each frozen participant, including nullable updated_at revision (null if unmarked). For each student, obtain explicit confirmation before calling attendance_record; this is not a bulk-write tool.",
    schema: sessionId, scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_attendance_record",
    description: "Record ONE confirmed participant status after preview. Requires the exact session/student IDs, expectedUpdatedAt from preview (null if unmarked), and a fresh idempotencyKey. Retries must reuse the same key and arguments. No bulk updates.",
    schema: z.object({
      sessionId: uuid, studentId: uuid,
      status: z.enum(["present","absent","late","excused","student_cancelled","teacher_cancelled"]),
      note: z.string().max(5000).default(""),
      noticeAt: z.string().datetime({offset:true}).optional(),
      cancelReason: z.string().max(1000).optional(),
      expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
      idempotencyKey: uuid,
    }).strict(), scope: "coach:write", readOnly: false,
  },
  {
    name: "ccp_attendance_bulk_record",
    description: "Atomically mark or correct 1–50 frozen participants without completing the session. Preview attendance first; supply each learner's exact updated_at (null if unmarked), one UUID key for the entire batch and explicit decisions. All changes roll back on a stale/missing participant; retry with the same key and arguments.",
    schema: attendanceBulkRecordSchema,
    scope: "coach:write", readOnly: false,
  },
  {
    name: "ccp_sessions_note_update",
    description: "Set a confirmed shared lesson topic/note on an identified session with an expected revision from sessions_list. Rejects stale edits; retry using the original idempotencyKey and arguments.",
    schema: z.object({
      sessionId: uuid, lessonNote: z.string().max(10000),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
      idempotencyKey: uuid,
    }).strict(), scope: "coach:write", readOnly: false,
  },
  {
    name:"ccp_chess_categories_create",
    description:"Create a teacher-owned chess skill category. Confirm its label before adding to progress history.",
    schema:z.object({name:categoryName,description:z.string().max(500).optional(),
      sortOrder:z.number().int().min(0).max(10000).optional(),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_chess_categories_update",
    description:"Rename, describe or reorder an existing chess skill category without rewriting observations. Explicit confirmation required.",
    schema:z.object({categoryId:chessUuid,name:categoryName.optional(),
      description:z.string().max(500).optional(),
      sortOrder:z.number().int().min(0).max(10000).optional(),
      confirmed:z.literal(true)}).strict().refine(a=>a.name!==undefined||a.description!==undefined||
      a.sortOrder!==undefined,"Provide a change"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_material_links_unlink_impact",
    description:"Preview removal of one canonical material association; learning material and attested evidence remain intact.",
    schema:z.object({linkId:chessUuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_material_links_unlink",
    description:"Remove one current material/student or material/session association with expected revision and explicit approval. History is preserved.",
    schema:materialLinkUnlinkInput,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_chess_categories_delete_impact",
    description:"Preview whether a teacher-owned chess skill category has historical observations. Used before a confirmed deletion.",
    schema:z.object({categoryId:chessUuid}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_chess_categories_delete",
    description:"Delete only an unused teacher-owned chess skill category after explicit confirmation. Never erase recorded chess observations.",
    schema:z.object({categoryId:chessUuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_chess_observations_update",
    description:"Correct a teacher-owned existing chess observation, skill category or observation date. Do not silently alter confirmed history; teacher approval required.",
    schema:z.object({observationId:chessUuid,observation:observationText.optional(),
      categoryId:chessUuid.optional(),observedAt:observedAt.optional(),
      confirmed:z.literal(true)}).strict().refine(a=>a.observation!==undefined||
      a.categoryId!==undefined||a.observedAt!==undefined,"Provide a correction"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_material_links_update",
    description:"Reassign one identified student/session material link to another canonical typed material; revision check and confirmation required. Edit content via learning_materials_update.",
    schema:materialLinkUpdateInput,scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_chess_categories_list",
    description: "Read configurable teacher-owned chess skills. Select stable category IDs before proposing an observation.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_chess_observations_list",
    description: "Read student chess observation history including source and verification. Never treat agent suggestions as approved.",
    schema: z.object({studentId:chessUuid,sessionId:chessUuid.optional()}).strict(),
    scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_chess_observations_propose",
    description: "PROPOSE an unverified AI-authored observation for one identified student. This never approves or overrides teacher assessments.",
    schema: observationInput, scope: "coach:write", readOnly: false,
  },
  {
    name:"ccp_materials_history_list",
    description:"List **explicitly recorded** study/material stages for a teacher-owned student, workplace or session. Stages distinguish assigned, actually taught, and teacher-attested completed; mere study links are never counted. Workplace results deduplicate sessions in page summary.",
    schema:materialsHistoryFilter,
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_materials_aggregate",
    description:"Summarize the entire filtered student/workplace/session material evidence ledger (not merely the current page). Counts assigned/taught/completed separately and deduplicates group sessions. Explicit teacher evidence only, not inferred mastery; up to 5000 claims.",
    schema:materialsHistoryFilter,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_material_defaults_list",
    description:"Read teacher-owned default Lichess studies for one workplace and optional group, including versioned change history. Defaults do not imply taught or completed.",
    schema:z.object({workplaceId:uuid,groupId:uuid.optional(),
      includeArchived:z.boolean().default(false)}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_material_default_create",
    description:"Attach one explicitly confirmed official Lichess study/chapter default to a workplace or group. Idempotent request ID and owner validation; does not claim any student learned it.",
    schema:defaultCreateSchema.omit({operation:true}),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_material_default_update",
    description:"Correct a study default label/link/notes with latest revision and explicit confirmation, retaining the prior values in the audit trail.",
    schema:defaultUpdateToolSchema,
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_material_default_archive",
    description:"Archive a study default with revision and confirmation, retaining historical audits and teaching evidence.",
    schema:defaultArchiveSchema.omit({operation:true}),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_materials_history_record",
    description:"After explicit teacher confirmation, append an assigned/taught/completed claim for a canonical typed material ID and identified learner, optionally tied to workplace/session. requestId makes repeats idempotent; a model must never infer completed from merely opening a study.",
    schema:materialsHistoryRecord,
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_materials_history_void",
    description:"Correct mistaken teaching/learning evidence. Requires exact updatedAt revision, reason and explicit confirmation. Retains original claim in the audit trail; does not silently delete history.",
    schema:materialsHistoryVoid,
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_materials_lesson_use_preview",
    description:"Read-only preview for using a known OR newly created typed chess material in an EXISTING COMPLETED lesson. Validates session date, exact frozen participant IDs, documented attendance and explicitly attested assigned/taught/completed stage per chosen learner. Returns a safe proposed commit and current revision; no writes or inferred mastery. Use lesson capture tools first if the session does not yet exist.",
    schema:materialInLessonPreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_materials_lesson_use_commit",
    description:"After reviewing ccp_materials_lesson_use_preview and confirming exact session, material and selected learners, atomically create/reuse the typed material, link it to the completed session and record individual teacher-attested evidence with a single retry-safe UUID. The server enforces revisions, presence, ownership and rollback; neither a link nor taught status proves mastery.",
    schema:materialInLessonCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_material_links_list",
    description:"List canonical typed material associations for one teacher-owned student or lesson, including catalog title and source URL.",
    schema:materialLinkListInput,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_material_links_create",
    description:"Attach an existing typed learning material to a student or coaching session, with explicit approval and an idempotent request UUID. Does not imply mastery.",
    schema:materialLinkCreateInput,scope:"coach:write",readOnly:false,
  },
  // All new writes are routed through the single transactional teacher-owned SQL
  // operation. The receipt is replay-safe and contains only IDs and audit metadata.
  {
    name: "ccp_workplaces_create",
    description: "Create a teacher-owned workplace. Confirm its name, IANA time zone and currency.",
    schema: z.object({name:shortName, timezone:z.string().min(1).max(80),
      currency:currency.default("USD"),locale:locale.default("en"),
      policy:resourcePolicy.default({}),...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_workplaces_update",
    description:"Edit an identified workplace using its latest revision from workplaces_list. No silent overwrite.",
    schema:z.object({workplaceId:uuid,name:shortName.optional(),timezone:z.string().min(1).max(80).optional(),
      currency:currency.optional(),locale:locale.optional(),policy:resourcePolicy.optional(),...revision}).strict()
      .refine(v => v.name!==undefined || v.timezone!==undefined || v.currency!==undefined ||
        v.locale!==undefined || v.policy!==undefined,"At least one change is required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_students_create",
    description:"Create a basic teacher-owned learner with name and optional level. For an optional independent contact, birthdate, notes, or direct archiving use the full student create tool.",
    schema:z.object({name:shortName,level:z.string().trim().max(120).nullable().optional(),...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_students_create_full",
    description:"Create an active or already archived teacher-owned learner with optional independent contact, birthdate, level and private notes in ONE atomic website/MCP transaction. A contact grants neither portal access nor billing authority. archived=true never consumes active quota. Requires an idempotency key and approval; output redacts private notes and contact details.",
    schema:studentCreateSchema.extend({
      idempotencyKey:uuid,confirmed:z.literal(true),
    }).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_students_update",
    description:"Edit a specific student ID, never an ambiguous name. Requires revision from students_search.",
    schema:z.object({studentId:uuid,name:shortName.optional(),
      level:z.string().trim().max(120).nullable().optional(),...revision}).strict()
      .refine(v=>v.name!==undefined||v.level!==undefined,"At least one change is required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_workplaces_enroll",
    description:"Enroll a stable student ID in a stable teacher-owned workplace ID. Never guess a workplace from a student name or historical attendance; when missing, list valid workplaces and ask teacher to choose. Single-member operation; do not imply group membership, portal access or billing authority.",
    schema:z.object({workplaceId:uuid,studentId:uuid,...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_workplaces_unenroll_preview",
    description:"Preview ending the exact owned dated workplace membership. Returns membership revision, active group/slot/future lesson blockers, historical-preserving end date and the explicit hold-only credit policy. Read the preview before confirming an end.",
    schema:z.object({workplaceId:uuid,studentId:uuid}).strict(),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_workplaces_unenroll",
    description:"Confirm ending a workplace membership without deleting any historical periods, frozen lessons or credits. Check the preview first and resolve active group/recurrence/future-session blockers. This never refunds or transfers credits.",
    schema:z.object({workplaceId:uuid,studentId:uuid,confirmed:z.literal(true),
      expectedRevision:z.number().int().positive().optional(),
      idempotencyKey:uuid.optional(),reason:z.string().trim().min(8).max(1000).optional(),
    }).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_workplaces_enrollments",
    description:"List members of an identified teacher-owned workplace.",
    schema:z.object({workplaceId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_credits_adjustment_preview",
    description:"Inspect an exact teacher-owned purchased credit package, remaining entitlements, redemptions, adjustments, expiry, invoice payment status and funding. Never infer a cash refund or transfer from archival.",
    schema:creditAdjustmentPreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_credits_adjustment_commit",
    description:"Explicitly approve a credit grant, forfeiture, transfer between compatible owned paid packages, expiry extension, or refund entitlement backed by an independently recorded payment refund reversal. No cash is moved. Requires reason, exact package ID, expected credit balance, confirmed true and a durable unique retry ID. Call preview first; do not improvise finance evidence.",
    schema:creditAdjustmentCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_groups_create",
    description:"Create a class group inside one identified authorized workplace.",
    schema:z.object({workplaceId:uuid,name:shortName,...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_groups_update",
    description:"Rename an identified group within its workplace, with revision and retry key.",
    schema:z.object({groupId:uuid,workplaceId:uuid,name:shortName,...revision}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_groups_enroll",
    description:"Add one identified student to one identified group; the workplace enrollment is included atomically.",
    schema:z.object({groupId:uuid,studentId:uuid,...mutation}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_groups_unenroll",
    description:"Remove one explicitly confirmed current group membership. Historical frozen lesson rosters remain unchanged.",
    schema:z.object({groupId:uuid,studentId:uuid,...mutation,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_schedule_day_preview",
    description:"Review one teacher-owned workplace-local calendar date for 1–50 explicit active student IDs. Check every enrollment and exactly shared active recurring start/duration, DST safety and occupied canonical lesson intervals. Never writes or silently enrolls students.",
    schema:scheduleDayPreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_students_resolve",
    description:"Resolve up to 100 exact teacher-owned active student full names and Hebrew/English aliases to stable IDs. Return ambiguity candidates or missing-name issues without guessing, fuzzy search, archived students or private contacts. Read-only.",
    schema:studentNamesResolveSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_lessons_capture_commit_with_chapter",
    description:"After a read-only reviewed lesson-capture preview with an exact authorized study/chapter, atomically create ONE multi-student session and its assigned chapter evidence inside the SAME SQL transaction. Confirm stable roster, source verified timestamp and roster hash; use two distinct UUID receipts and confirmed=true. Never infer attendance, lesson completion or mastery; failed chapter writes roll back the lesson.",
    schema:atomicLessonChapterCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_lessons_archived_recovery_preview",
    description:"For a new future lesson with an archived learner, review exact stable student IDs (1–50), explicitly chosen historically verified workplace, schedule, current lifecycle revision and retained credits. Read-only; resolve names first, then ask the coach whether to reactivate and create the lesson. Never use this for a historical correction.",
    schema:archivedLessonRecoveryPreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_lessons_archived_recovery_commit",
    description:"Only AFTER explicit coach approval, atomically reactivate precisely the reviewed archived student IDs at one verified historical workplace AND create a new future 1:1 or ad-hoc lesson with frozen attendance-unmarked roster. Recheck expectedUpdatedAt, capacity, tenant, enrollment and schedule in SQL; all changes roll back together, retries are idempotent. Requires reason, confirmed=true and request UUID. No automatic group/credit/financial changes.",
    schema:archivedLessonRecoveryCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_lessons_capture_preview",
    description:"Read-only one-to-fifty-student capture preview: resolve exact full names/aliases and owner-scoped workplace, then EITHER supply exact offset time and duration OR date-only localDate to infer a single common active workplace weekly slot. No time guessing if slot missing/ambiguous/DST, and no write/attendance/mastery inference. For archived matches, review exact IDs with ccp_lessons_archived_recovery_preview and require separate confirmed atomic ccp_lessons_archived_recovery_commit; for active learners, use ccp_sessions_create for one or ccp_sessions_ad_hoc_create for 2–50.",
    schema:lessonCapturePreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_lessons_capture_completed",
    description:"After ccp_lessons_capture_preview resolves the exact enrolled learner IDs, workplace and time, record a COMPLETED group lesson with one explicit attendance decision and independent note for each frozen learner. Backend creates the session AND completes attendance in one owner-scoped SQL transaction, counts teacher minutes once, rejects ambiguities and retries safely. Teacher confirmation and request UUID are mandatory. No material mastery inferred. To SCHEDULE without attendance, use ccp_sessions_ad_hoc_create instead.",
    schema:completedGroupCaptureSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_sessions_ad_hoc_create",
    description:"Schedule a single one-off lesson for 2–50 already enrolled students without a permanent class. Freeze roster and unmarked attendance atomically. Confirm approved participants and time.",
    schema:z.object({workplaceId:uuid,studentIds:z.array(uuid).min(2).max(50),
      title:z.string().trim().min(1).max(160),startsAt:instant,
      durationMinutes:z.number().int().min(15).max(480),
      lessonNote:z.string().max(10000).default(""),idempotencyKey:uuid,
      confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_sessions_details",
    description:"Read one identified lesson, including its current revision and frozen roster.",
    schema:sessionId,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_sessions_create",
    description:"Schedule one identified workplace/group or student lesson at an ISO instant WITH offset; conflicts are rejected. Frozen participants at creation.",
    schema:z.object({workplaceId:uuid,groupId:uuid.optional(),studentId:uuid.optional(),
      title:z.string().trim().min(1).max(160),startsAt:instant,
      durationMinutes:z.number().int().min(15).max(480),lessonNote:z.string().max(10000).default(""),
      ...mutation}).strict().refine(v=>Boolean(v.groupId)!==Boolean(v.studentId),
      "Choose exactly one group or student"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_sessions_edit",
    description:"Confirmed, revision-checked edit of a teaching session's title, shared note, time, duration, home visit or scheduled/cancelled status. To mark completed use ccp_sessions_complete with every frozen learner and explicit attendance; status-only completion is prohibited.",
    schema:z.object({
      sessionId:uuid,
      changes:z.object({
        title:z.string().trim().min(1).max(160).optional(),
        startsAt:instant.optional(),
        durationMinutes:z.number().int().min(15).max(480).optional(),
        isHomeVisit:z.boolean().optional(),
        lessonNote:z.string().max(10000).optional(),
        status:z.enum(["scheduled","cancelled"]).optional(),
      }).strict().refine(x=>Object.keys(x).length>0,"At least one change required"),
      ...revision,confirmed:z.literal(true),
    }).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_sessions_complete",
    description:"Atomically complete one lesson with every frozen learner\u0027s explicit attendance and current revisions. Omit optional lessonNote to preserve the existing note; providing it intentionally REPLACES the session\u0027s shared note. Participant notes live separately. No material mastery inferred.",
    schema:lessonCompletionSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_sessions_reschedule",
    description:"Reschedule an identified scheduled lesson; requires its latest revision, explicit offset and confirmation.",
    schema:z.object({sessionId:uuid,startsAt:instant,
      durationMinutes:z.number().int().min(15).max(480),...revision,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_sessions_roster_preview",
    description:"Read the exact frozen roster and revision of one owned session; group enrollments are unaffected.",
    schema:z.object({sessionId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_sessions_roster_correct",
    description:"Confirm one revision-checked correction to a session's FROZEN historical roster, not group membership. Provide all desired owned student IDs, reason and idempotency key; removed attendance is audited. Removing linked chess evidence is blocked.",
    schema:z.object({sessionId:uuid,studentIds:z.array(uuid).min(1).max(100),
      expectedUpdatedAt:instant,idempotencyKey:uuid,
      reason:z.string().trim().min(8).max(1000),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_sessions_roster_revisions_list",
    description:"Read append-only historical roster corrections, redacting removed attendance notes unless includePrivate=true and confirmed=true.",
    schema:z.object({sessionId:uuid,includePrivate:z.boolean().default(false),
      confirmed:z.literal(true).optional()}).strict()
      .refine(v=>!v.includePrivate||v.confirmed===true,"Private attendance notes require explicit confirmation"),
    scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_sessions_cancel",
    description:"Cancel ONE identified scheduled lesson after confirmation. Does not delete history.",
    schema:z.object({sessionId:uuid,...revision,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },

  {
    name:"ccp_learning_materials_list",
    description:"Search/list teacher-owned chess learning materials by type and title; games, puzzles, drills and studies share a catalog but have different typed details.",
    schema:materialCatalogFilterSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_learning_materials_get",
    description:"Fetch one specific teacher-owned typed chess learning material and its details. A link alone is not proof of teaching.",
    schema:z.object({materialId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_learning_materials_create",
    description:"Create a typed game, puzzle, drill, study chapter or HTTPS link. For games, GigaChess checks all PGN mainline and variation moves against their starting FEN; invalid moves are refused. Do not infer player identity, mastery or lesson attendance. Require an idempotency UUID.",
    schema:materialCatalogCreateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_learning_materials_update",
    description:"Correct a teacher-owned typed chess material using the shared atomic root/subtype service, with GigaChess legality validation for revised game PGN mainlines and variations. Same kind, current revision, explicit confirmation and idempotency UUID required.",
    schema:materialCatalogUpdateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_learning_material_relations_list",
    description:"List typed source-game, derived and prerequisite material relationships. A relationship is not evidence of teaching or mastery.",
    schema:materialRelationListSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_learning_material_relation_change",
    description:"Link/unlink two authorized typed chess materials. Require source revision, explicit confirmation and an idempotency request ID; source-game puzzle extraction requires puzzle → game.",
    schema:materialRelationSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_learning_material_archive_preview",
    description:"Inspect a material's revision, linked homework and relations before attempting a history-preserving library archive.",
    schema:materialArchivePreviewSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_learning_material_lifecycle_change",
    description:"Archive or restore a teacher-owned learning material from active search without erasing history. Requires current revision, request UUID and explicit confirmation; linked materials cannot be archived.",
    schema:materialLifecycleSchema,scope:"coach:write",readOnly:false,
  },

  {
    name:"ccp_training_assignments_list",
    description:"List a teacher's student-specific chess homework, linked materials, documented attempts and reviews. A completed item is not a verified skill assessment.",
    schema:assignmentListSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_training_assignments_create",
    description:"Assign one existing game/puzzle/drill/study material to 1-100 active students, with independent assignment IDs. Explicit confirmation and retry-safe request UUID required.",
    schema:assignmentCreateSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_training_attempt_record",
    description:"Record instructor-entered homework attempt/completion evidence without claiming mastery; explicit confirmed idempotent write.",
    schema:assignmentAttemptSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_training_review_record",
    description:"Record separate teacher feedback on one homework assignment or attempt; does not alter a teacher-verified student skill grade.",
    schema:assignmentReviewSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_training_plans_list",
    description:"Read a teacher-owned student's explicit training plans, goals and statuses with no inferred skill mastery; paginated and archived-aware.",
    schema:trainingPlanListSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_training_plans_get",
    description:"Get one training plan with immutable revision snapshots and manually evidenced goal decisions.",
    schema:trainingPlanGetSchema,scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_training_plans_commit",
    description:"Create or revision-guard edit a training plan and independent chess goals, requiring teacher confirmation and an idempotency UUID. Achieved goals require explicit coach-written evidence; no inference from homework.",
    schema:trainingPlanCommitSchema,scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_coach_briefing_get",
    description:"Prepare a fact-based teacher-owned student briefing: recent lesson history, explicitly attested material, assigned homework, coach reviews and approved chess observations. Each item has stored source IDs, with unknowns marked. No AI-inferred mastery.",
    schema:coachBriefingSchema,scope:"coach:read",readOnly:true,
  },
] as const;

// OAuth permission is a real operation contract. The readOnly annotation is
// only a side-effect hint: external vision/rating previews legitimately use a
// coach:read grant while being annotated non-read-only due to outbound calls.
// Conflating the two previously hid those tools from read-only tools/list.
export const toolScopeByName = new Map<string,string>(catalogue.map(t => [t.name,t.scope]));

const destructiveTool = (name:string,readOnly:boolean) => !readOnly &&
  (/(?:^|_)(?:delete|void|revoke|rotate|cancel|unlink)(?:_|$)/.test(name) ||
   ["ccp_students_bulk_lifecycle_commit","ccp_learning_material_lifecycle_change",
    "ccp_billing_invoices_bulk"].includes(name));
const externalTool = (name:string) => [
  "ccp_student_ratings_refresh_preview","ccp_lichess_image_fen_propose",
  "ccp_lichess_puzzle_publish","ccp_events_email_invites",
  "ccp_billing_invoice_checkout","ccp_billing_invoice_send",
  "ccp_billing_invoices_bulk","ccp_materials_chapters_sync",
  "ccp_import_spreadsheet_suggest",
].includes(name);

export const exposedTools = catalogue.map(t => ({
  name: t.name, title: t.name,
  description: t.description,
  inputSchema: z.toJSONSchema(t.schema),
  annotations: {
    readOnlyHint: t.readOnly,
    destructiveHint: destructiveTool(t.name,t.readOnly),
    openWorldHint: externalTool(t.name),
  },
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
  // Check the permission *before* parsing input or disclosing validation
  // details of an operation unavailable to this OAuth grant.
  const requiredScope=toolScopeByName.get(name);
  if (!requiredScope) return {error:{code:"NOT_FOUND",message:"Unknown tool"}};
  if (!scopes.includes(requiredScope))
    return { error: { code: "FORBIDDEN", message: "Insufficient OAuth scope" } };
  const parsed = validateCall(name, input);
  if ("error" in parsed) return { error: parsed.error };
  const { tool, args } = parsed;
  void tool;
  try {
    // Scoped SQL RPC uses the end-user's JWT and RLS, not the service role.
    // It checks expected revision and stores the receipt and domain write in the same transaction.
    const operations: Record<string,string> = {
      ccp_workplaces_create:"workplaces.create",ccp_workplaces_update:"workplaces.update",
      ccp_workplaces_enroll:"workplaces.enroll",
      ccp_students_create:"students.create",ccp_students_update:"students.update",
      ccp_groups_create:"groups.create",ccp_groups_update:"groups.update",
      ccp_groups_enroll:"groups.enroll",ccp_groups_unenroll:"groups.unenroll",
      ccp_sessions_create:"sessions.create",ccp_sessions_reschedule:"sessions.reschedule",
      ccp_sessions_cancel:"sessions.cancel",
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
        const code = /CAPACITY_EXCEEDED|HOSTED_LIMIT_REACHED/.test(msg)?"CAPACITY_EXCEEDED":
          /FUTURE_COMMITMENTS/.test(msg)?"FUTURE_COMMITMENTS":
          /CONFLICT|23505|23P01/.test(msg)?"CONFLICT":
          /NOT_FOUND/.test(msg)?"NOT_FOUND":"VALIDATION_ERROR";
        return {error:{code,message:"Mutation rejected. Re-read the authorized record and verify IDs, revision, and schedule."}};
      }
      return {data};
    }
    switch (name) {
      case "ccp_training_plans_list":
        return {data:await teacherTrainingPlansList(db,teacherId,args as Parameters<typeof teacherTrainingPlansList>[2])};
      case "ccp_training_plans_get":
        return {data:await teacherTrainingPlanGet(db,teacherId,(args as {planId:string}).planId)};
      case "ccp_training_plans_commit":
        return {data:await teacherTrainingPlanCommit(db,teacherId,args as Parameters<typeof teacherTrainingPlanCommit>[2])};
      case "ccp_coach_briefing_get":
        return {data:await teacherCoachBriefing(db,teacherId,args as Parameters<typeof teacherCoachBriefing>[2])};
      case "ccp_training_assignments_list":
        return {data:await teacherAssignmentsList(db,teacherId,args as Parameters<typeof teacherAssignmentsList>[2])};
      case "ccp_training_assignments_create":
        return {data:await teacherAssignmentsCreate(db,teacherId,args as Parameters<typeof teacherAssignmentsCreate>[2])};
      case "ccp_training_attempt_record":
        return {data:await teacherAssignmentAttempt(db,teacherId,args as Parameters<typeof teacherAssignmentAttempt>[2])};
      case "ccp_training_review_record":
        return {data:await teacherAssignmentReview(db,teacherId,args as Parameters<typeof teacherAssignmentReview>[2])};
      case "ccp_learning_materials_list":
        return {data:await teacherMaterialCatalogList(db,teacherId,args as Parameters<typeof teacherMaterialCatalogList>[2])};
      case "ccp_learning_materials_get":
        return {data:await teacherMaterialCatalogGet(db,teacherId,(args as {materialId:string}).materialId)};
      case "ccp_learning_materials_create":
        return {data:await teacherMaterialCatalogCreate(db,teacherId,args as Parameters<typeof teacherMaterialCatalogCreate>[2])};
      case "ccp_learning_materials_update":
        return {data:await teacherMaterialCatalogUpdate(db,teacherId,args as Parameters<typeof teacherMaterialCatalogUpdate>[2])};
      case "ccp_learning_material_relations_list":
        return {data:await teacherMaterialRelationsList(db,teacherId,(args as {materialId:string}).materialId)};
      case "ccp_learning_material_relation_change":
        return {data:await teacherMaterialRelationChange(db,teacherId,args as Parameters<typeof teacherMaterialRelationChange>[2])};
      case "ccp_learning_material_archive_preview":
        return {data:await teacherMaterialArchivePreview(db,teacherId,(args as {materialId:string}).materialId)};
      case "ccp_learning_material_lifecycle_change":
        return {data:await teacherMaterialLifecycleChange(db,teacherId,args as Parameters<typeof teacherMaterialLifecycleChange>[2])};
      case "ccp_students_create_full": {
        const a=args as Parameters<typeof createStudentWithOptionalContact>[2];
        const result=await createStudentWithOptionalContact(db,teacherId,a);
        if(!result.ok)return {error:{
          code:result.status===403?"CAPACITY_EXCEEDED":
            result.status===404?"NOT_FOUND":
            result.status===409?"IDEMPOTENCY_CONFLICT":
            result.status===400?"VALIDATION_ERROR":"DATABASE_ERROR",
          message:result.error,
        }};
        return {data:{...safeStudentProfile(result.student),
          createdContactId:result.createdContactId}};
      }
      case "ccp_billing_generation_preview": {
        const a=args as {periodStart:string;periodEnd:string};
        return await billingActionResponse(await teacherBillingGenerate(db,teacherId,a));
      }
      case "ccp_billing_generation_commit": {
        const a=args as {periodStart:string;periodEnd:string;idempotencyKey?:string};
        // The MCP approval marker is transport metadata, never an ordinary
        // domain edit field; pass only fields accepted by the website service.
        return await billingActionResponse(await teacherBillingGenerate(db,teacherId,{
          periodStart:a.periodStart,periodEnd:a.periodEnd,
          idempotencyKey:a.idempotencyKey,commit:true,
        }));
      }
      case "ccp_billing_invoice_regenerate": {
        const a=args as {invoiceId:string;expectedUpdatedAt?:string;idempotencyKey?:string};
        return await billingActionResponse(await teacherBillingRegenerate(db,teacherId,a.invoiceId,{
          expectedUpdatedAt:a.expectedUpdatedAt,idempotencyKey:a.idempotencyKey,
        }));
      }
      case "ccp_billing_invoice_pdf": {
        const a=args as {invoiceId:string};
        const loaded=await loadInvoicePdf(db,{invoiceId:a.invoiceId,teacherId});
        if(!loaded.ok)return {error:{code:loaded.code.toUpperCase(),message:"Unable to generate invoice PDF"}};
        return invoicePdfMcpPayload(loaded.data.pdfBytes,loaded.data.filename);
      }
      case "ccp_billing_invoice_checkout": {
        const a=args as {invoiceId:string};
        return await billingActionResponse(await teacherBillingCheckout(db,teacherId,a.invoiceId,oauthOrigin()));
      }
      case "ccp_billing_invoices_bulk_preview": {
        const a=args as {ids:string[];includeRecipients:boolean;confirmed?:boolean};
        return await billingActionResponse(await teacherBillingBulkPreview(
          db,teacherId,a.ids,a.includeRecipients&&a.confirmed===true));
      }
      case "ccp_billing_invoices_bulk": {
        const a=args as {ids:string[];action:"send"|"delete"|"void";
          confirmedEmail?:boolean;previewDigest?:string};
        const user=(await db.auth.getUser()).data.user;
        return await billingActionResponse(await teacherBillingBulk(
          db,teacherId,user?.email,oauthOrigin(),{
            ids:a.ids,action:a.action,confirmedEmail:a.confirmedEmail,
            previewDigest:a.previewDigest,
          }));
      }
      case "ccp_students_bulk_lifecycle_preview": {
        const a=args as {rows:Parameters<typeof teacherBulkLifecyclePreview>[2]};
        return {data:await teacherBulkLifecyclePreview(db,teacherId,a.rows)};
      }
      case "ccp_students_bulk_lifecycle_commit": {
        const a=args as Parameters<typeof teacherBulkLifecycleCommit>[2];
        return {data:await teacherBulkLifecycleCommit(db,teacherId,a)};
      }
      case "ccp_historical_import_upload_handoff":
        return {data:{
          uploadUrl:oauthOrigin()+"/account",
          method:"Authenticated browser upload",
          instructions:"Upload the spreadsheet under Historical Attendance Import. Then use the returned private stageId with ccp_historical_attendance_preview. Never paste large private files into the chat.",
        }};
      case "ccp_historical_import_stage_info":
        return {data:await teacherHistoricalStageInfo(db,teacherId,
          (args as {stageId:string}).stageId)};
      case "ccp_historical_import_stage_delete":
        return {data:await teacherHistoricalStageDelete(db,teacherId,
          (args as {stageId:string}).stageId)};
      case "ccp_historical_attendance_dates_preview":
        return {data:await teacherHistoricalDatesPreview(db,teacherId,args)};
      case "ccp_historical_attendance_dates_commit":
        return {data:await teacherHistoricalDatesCommit(db,teacherId,args)};
      case "ccp_historical_attendance_preview":
        return {data:await teacherHistoricalAttendancePreview(db,teacherId,args)};
      case "ccp_historical_attendance_commit":
        return {data:await teacherHistoricalAttendanceCommit(db,teacherId,args)};
      case "ccp_historical_attendance_report":
        return {data:await teacherHistoricalAttendanceReport(db,teacherId,args)};
      case "ccp_historical_attendance_summary":
        return {data:await teacherHistoricalAttendanceSummary(
          db,teacherId,args as {studentId?:string;workplaceId?:string})};
      case "ccp_import_spreadsheet_parse": {
        const a=args as {filename:string;base64:string};
        const bytes=Buffer.from(a.base64,"base64");
        if(bytes.length>MAX_SPREADSHEET_BYTES)
          return {error:{code:"FILE_TOO_LARGE",message:"Spreadsheet exceeds 2 MB"}};
        const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
        return {data:teacherSpreadsheetParse(a.filename,arrayBuffer)};
      }
      case "ccp_import_spreadsheet_preview": {
        const a=args as {rows:Record<string,string>[];mapping:ColumnMapping};
        return {data:teacherSpreadsheetPreview(a)};
      }
      case "ccp_import_spreadsheet_suggest": {
        const a=args as {headers:string[];sampleRows?:Record<string,string>[];useAi:boolean;confirmedExternal?:boolean};
        return {data:await teacherSpreadsheetSuggest(db,teacherId,a)};
      }
      case "ccp_import_spreadsheet_commit": {
        const a=args as {rows:Record<string,string>[];mapping:ColumnMapping;idempotencyKey?:string;workplaceId?:string};
        const response=await teacherSpreadsheetCommit(db,teacherId,a);
        const data=await response.json();
        if(!response.ok)
          return {error:{code:data.code??(response.status===403?"FORBIDDEN":
            response.status===409?"CONFLICT":"VALIDATION_ERROR"),
            message:data.error??"Spreadsheet import failed",workplaces:data.workplaces}};
        return {data};
      }
      case "ccp_settings_export":
        return {data:await teacherSafeExport(db,teacherId)};
      case "ccp_settings_export_csv":
        return {data:await teacherCsvExport(db,teacherId,args as {
          table?:string;offset:number;limit:number})};
      case "ccp_settings_import_preview": {
        const a=args as {payload:unknown};
        const {payload,...preview}=teacherImportPreview(a.payload);
        return {data:preview};
      }
      case "ccp_settings_import_apply": {
        const a=args as {payload:unknown;expectedSha256:string};
        return {data:await teacherImportApply(db,teacherId,a.payload,a.expectedSha256)};
      }
      case "ccp_billing_manual_payment_record": {
        const a=args as {invoiceId:string;amountCents?:number;note?:string;idempotencyKey:string};
        return {data:await teacherManualPaymentRecord(db,teacherId,a.invoiceId,a)};
      }
      case "ccp_billing_manual_payment_delete": {
        const a=args as {invoiceId:string;paymentId:string};
        return {data:await teacherManualPaymentDelete(db,teacherId,a.invoiceId,a.paymentId)};
      }
      case "ccp_credits_packages_list": {
        const a=args as {studentId?:string};
        return {data:await teacherCreditPackagesList(db,teacherId,a.studentId)};
      }
      case "ccp_credits_package_create": {
        const a=args as Parameters<typeof teacherCreditPackageCreate>[2];
        return {data:await teacherCreditPackageCreate(db,teacherId,a)};
      }
      case "ccp_credits_package_expiry": {
        const a=args as {packageId:string;expiresOn:string;expectedBalance:number;requestId:string;reason:string};
        return {data:await teacherCreditPackageExpiry(db,teacherId,a.packageId,a.expiresOn,{
          expectedBalance:a.expectedBalance,requestId:a.requestId,reason:a.reason,
        })};
      }
      case "ccp_credits_redemption_return": {
        const a=args as {redemptionId:string};
        return {data:await teacherCreditRedemptionReturn(db,teacherId,a.redemptionId)};
      }
      case "ccp_connections_list":
        return {data:await teacherConnectionsList(teacherId)};
      case "ccp_connections_revoke": {
        const a=args as {connectionId:string};
        return {data:await teacherConnectionRevoke(teacherId,a.connectionId)};
      }
      case "ccp_billing_invoice_draft_update": {
        const a=args as {invoiceId:string;changes:Parameters<typeof teacherInvoiceDraftUpdate>[3]};
        return {data:await teacherInvoiceDraftUpdate(db,teacherId,a.invoiceId,a.changes)};
      }
      case "ccp_billing_invoice_void": {
        const a=args as {invoiceId:string;idempotencyKey?:string};
        return {data:await teacherInvoiceVoid(db,teacherId,a.invoiceId,a.idempotencyKey)};
      }
      case "ccp_billing_invoice_delete": {
        const a=args as {invoiceId:string};
        return {data:await teacherInvoiceDelete(db,teacherId,a.invoiceId)};
      }
      case "ccp_billing_invoice_send_preview": {
        const a=args as {invoiceId:string;includeRecipients:boolean;confirmed?:boolean};
        return {data:await teacherInvoiceSendPreview(
          db,teacherId,a.invoiceId,a.includeRecipients&&a.confirmed===true)};
      }
      case "ccp_billing_invoice_send": {
        const a=args as {invoiceId:string};
        const user=(await db.auth.getUser()).data.user;
        const result=await teacherInvoiceSend(db,teacherId,a.invoiceId,user?.email,oauthOrigin());
        const {checkoutUrl,...safe}=result;
        return {data:{...safe,checkoutCreated:Boolean(checkoutUrl)}};
      }
      case "ccp_billing_invoices_list": {
        const a=args as Parameters<typeof teacherInvoicesList>[2];
        return {data:await teacherInvoicesList(db,teacherId,a)};
      }
      case "ccp_billing_invoice_detail": {
        const a=args as {invoiceId:string;includePrivate:boolean;confirmed?:boolean};
        const invoice=await teacherInvoiceDetail(db,teacherId,a.invoiceId);
        return {data:safeInvoice(invoice,a.includePrivate&&a.confirmed===true)};
      }
      case "ccp_billing_payments_export": {
        const a=args as {from?:string;to?:string};
        const report=await teacherPaymentsExport(db,teacherId,a);
        return {data:{...report,format:"csv"}};
      }
      case "ccp_teacher_settings_get": {
        const a=args as {includePaymentQrCode:boolean;confirmed?:boolean};
        const p=await teacherPolicyView(db,teacherId);
        return {data:{...p,
          payment_qr_code:a.includePaymentQrCode&&a.confirmed===true
            ?p.payment_qr_code:null,
          paymentQrCodeConfigured:Boolean(p.payment_qr_code)}};
      }
      case "ccp_teacher_credentials_handoff": {
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
      case "ccp_teacher_settings_update": {
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
      case "ccp_events_list":
        return {data:await teacherEventsList(db,teacherId)};
      case "ccp_events_detail": {
        const a=args as {eventId:string;includeRsvps:boolean;confirmed?:boolean};
        const result=await teacherEventDetail(db,teacherId,a.eventId);
        return {data:{event:{
          ...result.event,
          rsvps:a.includeRsvps&&a.confirmed===true?result.event.rsvps:[],
        }}};
      }
      case "ccp_events_create": {
        const a=args as Parameters<typeof teacherEventCreate>[2];
        return {data:await teacherEventCreate(db,teacherId,a)};
      }
      case "ccp_events_update": {
        const a=args as Parameters<typeof teacherEventUpdate>[3]&{eventId:string};
        return {data:await teacherEventUpdate(db,teacherId,a.eventId,a)};
      }
      case "ccp_events_delete_impact": {
        const a=args as {eventId:string};
        return {data:await teacherEventDeleteImpact(db,teacherId,a.eventId)};
      }
      case "ccp_events_delete": {
        const a=args as {eventId:string};
        return {data:await teacherEventDelete(db,teacherId,a.eventId)};
      }
      case "ccp_events_portal_invitations_list": {
        const a=args as {eventId:string};
        return {data:await teacherPortalEventInvitesList(db,teacherId,a.eventId)};
      }
      case "ccp_events_portal_invitations_create": {
        const {eventId,...input}=args as {eventId:string}&Parameters<typeof teacherPortalEventInviteCreate>[3];
        return {data:await teacherPortalEventInviteCreate(db,teacherId,eventId,input)};
      }
      case "ccp_events_portal_invitations_revoke": {
        const {eventId,inviteId,...input}=args as {eventId:string;inviteId:string}&
          Parameters<typeof teacherPortalEventInviteRevoke>[4];
        return {data:await teacherPortalEventInviteRevoke(db,teacherId,eventId,inviteId,input)};
      }
      case "ccp_reports_student_progress":
        return {data:await teacherStudentProgressReport(
          db,teacherId,(args as {studentId:string}).studentId)};
      case "ccp_account_security_handoff":
        return {data:{
          url:oauthOrigin()+"/account",
          browserOnly:true,
          action:"account-security",
          explanation:"Open the signed-in Account page and complete any required reauthentication. Email, password, MFA keys and recovery codes must never be submitted to a model.",
        }};
      case "ccp_hosted_subscription_handoff": {
        const {loadAccountEntitlementSummary}=await import("@/lib/server/entitlements");
        return {data:{
          url:oauthOrigin()+"/account",
          browserOnly:true,
          action:"account-entitlements",
          entitlements:await loadAccountEntitlementSummary(db),
          explanation:"Account capacity and plan access come from the shared SQL entitlement state. Subscription checkout is not yet active.",
        }};
      }
      case "ccp_teacher_federation_default_get":
        return {data:await federationDefaultGet(db,teacherId)};
      case "ccp_teacher_federation_default_set": {
        const a=args as Parameters<typeof federationDefaultSet>[2];
        return {data:await federationDefaultSet(db,teacherId,a)};
      }
      case "ccp_student_billing_assignments_list": {
        const a=args as Parameters<typeof payerAssignmentsList>[2];
        return {data:await payerAssignmentsList(db,teacherId,a)};
      }
      case "ccp_student_billing_assignments_create": {
        const a=args as Parameters<typeof payerAssignmentCreate>[2];
        return {data:await payerAssignmentCreate(db,teacherId,a)};
      }
      case "ccp_student_billing_assignments_end": {
        const a=args as Parameters<typeof payerAssignmentEnd>[2];
        return {data:await payerAssignmentEnd(db,teacherId,a)};
      }
      case "ccp_student_federations_get": {
        const a=args as {studentId:string};
        return {data:await federationStudentSummary(db,teacherId,a.studentId)};
      }
      case "ccp_student_federations_link": {
        const a=args as Parameters<typeof federationMembershipCreate>[2];
        return {data:await federationMembershipCreate(db,teacherId,a)};
      }
      case "ccp_student_federations_update": {
        const a=args as Parameters<typeof federationMembershipUpdate>[2];
        return {data:await federationMembershipUpdate(db,teacherId,a)};
      }
      case "ccp_student_federation_ratings_record": {
        const a=args as Parameters<typeof federationManualRatingRecord>[2];
        return {data:await federationManualRatingRecord(db,teacherId,a)};
      }
      case "ccp_compensation_agreements_list": {
        const a=args as {workplaceId?:string;includeArchived?:boolean};
        return {data:await compensationAgreementsList(db,teacherId,a)};
      }
      case "ccp_compensation_agreements_get": {
        const a=args as {agreementId:string};
        return {data:await compensationAgreementGet(db,teacherId,a.agreementId)};
      }
      case "ccp_compensation_agreements_create": {
        const a=args as Parameters<typeof compensationAgreementCreate>[2];
        return {data:await compensationAgreementCreate(db,teacherId,a)};
      }
      case "ccp_compensation_agreements_update": {
        const a=args as Parameters<typeof compensationAgreementUpdate>[2];
        return {data:await compensationAgreementUpdate(db,teacherId,a)};
      }
      case "ccp_compensation_agreements_preview": {
        const a=args as Parameters<typeof compensationAgreementPreview>[2];
        return {data:await compensationAgreementPreview(db,teacherId,a)};
      }
      case "ccp_finance_ledger_list":
        return {data:await financeLedgerList(db,teacherId)};
      case "ccp_finance_obligation_approve": {
        const a=args as Parameters<typeof financialObligationApprove>[2];
        return {data:await financialObligationApprove(db,teacherId,a)};
      }
      case "ccp_finance_payment_record": {
        const a=args as Parameters<typeof receivedPaymentRecord>[2];
        return {data:await receivedPaymentRecord(db,teacherId,a)};
      }
      case "ccp_finance_allocation_record": {
        const a=args as Parameters<typeof paymentAllocate>[2];
        return {data:await paymentAllocate(db,teacherId,a)};
      }
      case "ccp_finance_reversal_record": {
        const a=args as Parameters<typeof financialReverse>[2];
        return {data:await financialReverse(db,teacherId,a)};
      }
      case "ccp_workplace_context_get":
        return {data:await teacherWorkplaceContextGet(db,teacherId)};
      case "ccp_workplace_context_set": {
        const a=args as Parameters<typeof teacherWorkplaceContextSet>[2];
        return {data:await teacherWorkplaceContextSet(db,teacherId,a)};
      }
      case "ccp_teacher_profile_get":
        return {data:await teacherProfileGet(db,teacherId)};
      case "ccp_teacher_profile_update": {
        const a=args as {displayName?:string;avatarUrl?:string|null;preferredLocale?:"en"|"he"|"ru";confirmed:true};
        // Approval is an MCP transport control, never an editable profile field.
        // Pass only the same domain fields accepted by the website.
        return {data:await teacherProfileUpdate(db,teacherId,{
          displayName:a.displayName,avatarUrl:a.avatarUrl,preferredLocale:a.preferredLocale,
        })};
      }
      case "ccp_calendar_feed_status":
        return {data:await teacherCalendarFeedStatus(db,teacherId)};
      case "ccp_calendar_feed_rotate":
        return {data:await teacherCalendarFeedRotate(db,teacherId)};
      case "ccp_events_email_preview": {
        const a=args as {eventId:string;includeRecipients:boolean;confirmed?:boolean};
        return {data:await teacherEventInvitePreview(
          db,teacherId,a.eventId,a.includeRecipients&&a.confirmed===true)};
      }
      case "ccp_events_email_invites": {
        const a=args as {eventId:string};
        const user=(await db.auth.getUser()).data.user;
        return {data:await teacherEventInviteEmail(db,teacherId,a.eventId,user?.email,oauthOrigin())};
      }
      case "ccp_session_attendance_list": {
        const a=args as {sessionId:string};
        return {data:await canonicalAttendanceList(db,teacherId,a.sessionId)};
      }
      case "ccp_session_attendance_set": {
        const a=args as CanonicalAttendanceSetInput&{sessionId:string};
        return {data:await canonicalAttendanceSet(db,teacherId,a.sessionId,a)};
      }
      case "ccp_session_attendance_bulk_set": {
        const a=args as CanonicalAttendanceBulkInput&{sessionId:string};
        return {data:await canonicalAttendanceBulkSet(db,teacherId,a.sessionId,a)};
      }
      case "ccp_canonical_makeup_credits_list": {
        return {data:{credits:await canonicalMakeupCreditsList(db,teacherId)}};
      }
      case "ccp_session_notes_list": {
        const a=args as {sessionId:string;includePrivate:boolean;confirmed?:boolean};
        return {data:await sessionNotesList(db,teacherId,a.sessionId,a)};
      }
      case "ccp_session_notes_save": {
        const a=args as SaveSessionNoteInput&{sessionId:string};
        return {data:await sessionNoteSave(db,teacherId,a.sessionId,a)};
      }
      case "ccp_private_sessions_create": {
        const a=args as CanonicalPrivateSessionCreateInput&{confirmed:boolean};
        return {data:await canonicalPrivateSessionCreate(db,teacherId,{
          studentId:a.studentId,workplaceId:a.workplaceId,
          date:a.date,time:a.time,durationMinutes:a.durationMinutes,
          isHomeVisit:a.isHomeVisit,makeupForSessionId:a.makeupForSessionId,
          idempotencyKey:a.idempotencyKey,
        })};
      }
      case "ccp_recurring_slots_list": {
        const a=args as {studentId?:string;activeOnly?:boolean};
        return {data:await canonicalSlotsList(db,teacherId,a)};
      }
      case "ccp_recurring_slots_create": {
        const a=args as Record<string,unknown>;
        const {confirmed,...input}=a;
        void confirmed;
        return {data:await canonicalSlotCreate(db,teacherId,
          input as import("@/lib/server/canonical-slot-service").CanonicalSlotCreateInput)};
      }
      case "ccp_recurring_slots_update": {
        const a=args as {slotId:string;changes:unknown;expectedUpdatedAt:string;idempotencyKey:string};
        return {data:await canonicalSlotUpdate(db,teacherId,a.slotId,{
          changes:a.changes as Record<string,never>,
          expectedUpdatedAt:a.expectedUpdatedAt,idempotencyKey:a.idempotencyKey,
        })};
      }
      case "ccp_recurring_slots_delete": {
        const a=args as {slotId:string;idempotencyKey:string};
        return {data:await canonicalSlotDelete(db,teacherId,a.slotId,{
          idempotencyKey:a.idempotencyKey,
        })};
      }
      case "ccp_contacts_list":
        return {data:await contactsList(db,teacherId)};
      case "ccp_contacts_detail": {
        const a=args as {contactId:string;includeDetails:boolean;confirmed?:boolean};
        return {data:safeContact(await contactDetail(db,teacherId,a.contactId),
          a.includeDetails&&a.confirmed===true)};
      }
      case "ccp_contacts_links_list": {
        const a=args as {contactId:string};
        return {data:await contactStudentLinksList(db,teacherId,a.contactId)};
      }
      case "ccp_contacts_create": {
        const a=args as Parameters<typeof contactCreate>[2];
        const created=await contactCreate(db,teacherId,a);
        return {data:{...created,email:undefined,phone:undefined,preferredLocale:undefined}};
      }
      case "ccp_contacts_update": {
        const a=args as Parameters<typeof contactUpdate>[3] & {contactId:string};
        const updated=await contactUpdate(db,teacherId,a.contactId,a);
        return {data:{...updated,email:undefined,phone:undefined,preferredLocale:undefined}};
      }
      case "ccp_student_contacts_list": {
        const a=args as {studentId:string};
        return {data:await studentContactsList(db,teacherId,a.studentId)};
      }
      case "ccp_student_contacts_link": {
        const a=args as Parameters<typeof studentContactLink>[3] & {studentId:string};
        return {data:await studentContactLink(db,teacherId,a.studentId,a)};
      }
      case "ccp_student_contacts_unlink": {
        const a=args as Parameters<typeof studentContactUnlink>[4] & {studentId:string;linkId:string};
        return {data:await studentContactUnlink(db,teacherId,a.studentId,a.linkId,a)};
      }
      case "ccp_billing_accounts_list":
        return {data:await billingAccountsList(db,teacherId)};
      case "ccp_billing_accounts_detail": {
        const a=args as {billingAccountId:string;includeContact:boolean;confirmed?:boolean};
        return {data:safeBillingAccount(await billingAccountDetail(db,teacherId,a.billingAccountId),
          a.includeContact&&a.confirmed===true)};
      }
      case "ccp_billing_accounts_create": {
        const a=args as Parameters<typeof billingAccountCreate>[2];
        const created=await billingAccountCreate(db,teacherId,a);
        return {data:{...created,contactId:undefined}};
      }
      case "ccp_billing_accounts_update": {
        const a=args as Parameters<typeof billingAccountUpdate>[3] & {billingAccountId:string};
        const updated=await billingAccountUpdate(db,teacherId,a.billingAccountId,a);
        return {data:{...updated,contactId:undefined}};
      }
      case "ccp_portal_grants_list": {
        const a=args as {contactId?:string;studentId?:string};
        return {data:await teacherPortalGrantsList(db,teacherId,a.contactId,a.studentId)};
      }
      case "ccp_portal_grants_get": {
        const a=args as {grantId:string};
        return {data:await teacherPortalGrantGet(db,teacherId,a.grantId)};
      }
      case "ccp_portal_grants_create": {
        const a=args as Parameters<typeof teacherPortalGrantCreate>[2];
        return {data:await teacherPortalGrantCreate(db,teacherId,a)};
      }
      case "ccp_portal_grants_revoke": {
        const {grantId,...input}=args as {grantId:string}&Parameters<typeof teacherPortalGrantRevoke>[3];
        return {data:await teacherPortalGrantRevoke(db,teacherId,grantId,input)};
      }
      case "ccp_skill_dimensions_list":
        return {data:await skillDimensionsList(db,teacherId)};
      case "ccp_skill_dimensions_create": {
        const a=args as {name:string;requestId?:string};
        return {data:await skillDimensionsCreate(db,teacherId,a.name,a.requestId)};
      }
      case "ccp_skill_dimensions_update": {
        const a=args as {dimensionId:string;name:string};
        return {data:await skillDimensionsUpdate(db,teacherId,a.dimensionId,a.name)};
      }
      case "ccp_skill_dimensions_delete_impact": {
        const a=args as {dimensionId:string};
        return {data:await skillDimensionsDeleteImpact(db,teacherId,a.dimensionId)};
      }
      case "ccp_skill_dimensions_delete": {
        const a=args as {dimensionId:string;expectedAssessmentCount:number};
        return {data:await skillDimensionsDelete(db,teacherId,a.dimensionId,a.expectedAssessmentCount)};
      }
      case "ccp_teacher_context_get":
        return {data:await teacherContextGet(db,teacherId)};
      case "ccp_student_ratings_list":
        return {data:await teacherStudentRatingHistory(db,teacherId,
          args as Parameters<typeof teacherStudentRatingHistory>[2])};
      case "ccp_student_ratings_record":
        return {data:await teacherStudentRatingRecord(db,teacherId,
          args as Parameters<typeof teacherStudentRatingRecord>[2])};
      case "ccp_student_ratings_refresh_preview":
        return {data:await teacherStudentRatingRefreshPreview(db,teacherId,
          args as Parameters<typeof teacherStudentRatingRefreshPreview>[2])};
      case "ccp_student_ratings_refresh_commit":
        return {data:await teacherStudentRatingRefreshCommit(db,teacherId,
          args as Parameters<typeof teacherStudentRatingRefreshCommit>[2])};
      case "ccp_materials_preferences_list":
        return {data:await teacherStudyPreferencesList(db,teacherId,
          args as Parameters<typeof teacherStudyPreferencesList>[2])};
      case "ccp_materials_preferences_resolve":
        return {data:await teacherStudyPreferenceResolve(db,teacherId,
          args as Parameters<typeof teacherStudyPreferenceResolve>[2])};
      case "ccp_materials_preferences_set":
        return {data:await teacherStudyPreferenceSet(db,teacherId,
          args as Parameters<typeof teacherStudyPreferenceSet>[2])};
      case "ccp_materials_chapters_search":
        return {data:await teacherStudyIndexSearch(db,teacherId,
          args as Parameters<typeof teacherStudyIndexSearch>[2])};
      case "ccp_materials_chapters_get":
        return {data:await teacherStudyIndexGet(db,teacherId,
          args as Parameters<typeof teacherStudyIndexGet>[2])};
      case "ccp_materials_chapters_sync":
        return {data:await teacherStudyIndexSync(db,teacherId,
          args as Parameters<typeof teacherStudyIndexSync>[2])};
      case "ccp_materials_link_preview":
        return {data:await teacherLessonChapterPreview(db,teacherId,
          args as Parameters<typeof teacherLessonChapterPreview>[2])};
      case "ccp_materials_link_commit":
        return {data:await teacherLessonChapterCommit(db,teacherId,
          args as Parameters<typeof teacherLessonChapterCommit>[2])};
      case "ccp_chess_fen_validate": {
        const a=args as {fen:string;source:"manual"|"image"};
        return {data:teacherFenValidate(a.fen,a.source)};
      }
      case "ccp_puzzles_study_series_list":
        return {data:await teacherPuzzleSeriesList(db,teacherId)};
      case "ccp_puzzles_study_capacity":
        return {data:await teacherPuzzleStudyCapacity(teacherId,
          args as Parameters<typeof teacherPuzzleStudyCapacity>[1])};
      case "ccp_puzzles_study_create":
        return {data:await teacherPuzzleSeriesCreate(db,teacherId,
          args as Parameters<typeof teacherPuzzleSeriesCreate>[2])};
      case "ccp_puzzles_study_reconcile":
        return {data:await teacherPuzzleSeriesReconcile(db,teacherId,
          args as Parameters<typeof teacherPuzzleSeriesReconcile>[2])};
      case "ccp_lichess_connection_status": {
        return {data:await lichessConnectionStatus(teacherId)};
      }
      case "ccp_lichess_image_fen_propose": {
        const input=args as Parameters<typeof teacherImageFenPropose>[2];
        return {data:await teacherImageFenPropose(db,teacherId,input)};
      }
      case "ccp_lichess_puzzle_preview": {
        return {data:teacherLichessPuzzlePreview(args as Parameters<typeof teacherLichessPuzzlePreview>[0])};
      }
      case "ccp_lichess_puzzle_publish": {
        return {data:await teacherLichessPuzzlePublish(
          db,teacherId,args as Parameters<typeof teacherLichessPuzzlePublish>[2])};
      }
      case "ccp_lichess_studies_search": {
        const a=args as {studyId?:string;query?:string;chapterNumber?:number;limit:number};
        return {data:await teacherLichessStudiesSearch(teacherId,a)};
      }
      case "ccp_lichess_connect_handoff": {
        const a=args as {mode:"read"|"write";returnTo:"learning"|"account"};
        return {data:lichessConnectionHandoff(a.mode,a.returnTo)};
      }
      case "ccp_lichess_connection_disconnect": {
        return {data:await disconnectLichess(teacherId)};
      }
      case "ccp_student_skill_assessments_list": {
        const a=args as {studentId:string;limit:number;offset:number};
        return {data:await studentSkillAssessmentsList(db,teacherId,a.studentId,{limit:a.limit,offset:a.offset})};
      }
      case "ccp_student_skill_assessments_record": {
        const a=args as {studentId:string;ratings:Parameters<typeof studentSkillAssessmentsRecord>[3];idempotencyKey?:string;assessedOn?:string};
        return {data:await studentSkillAssessmentsRecord(db,teacherId,a.studentId,a.ratings,a.idempotencyKey,a.assessedOn)};
      }
      case "ccp_students_roster": {
        const a=args as {query?:string;includeArchived:boolean;archivedOnly:boolean;offset:number;limit:number};
        const result=await teacherStudentsRoster(db,teacherId,a);
        return {data:{students:result.students.map(safeStudentProfile),nextOffset:result.nextOffset}};
      }
      case "ccp_students_profile": {
        const a=args as {studentId:string;includePrivate:boolean;confirmed?:boolean};
        const profile=await teacherStudentProfile(db,teacherId,a.studentId);
        return {data:a.includePrivate && a.confirmed ? profile : safeStudentProfile(profile)};
      }
      case "ccp_students_chess_history": {
        const a=args as {studentId:string;offset:number;limit:number};
        return {data:await teacherStudentChessHistory(db,teacherId,a.studentId,a)};
      }
      case "ccp_students_delete_impact": {
        const a=args as {studentId:string};
        return {data:await teacherStudentDeleteImpact(db,teacherId,a.studentId)};
      }
      case "ccp_students_delete": {
        const a=args as {studentId:string;expectedUpdatedAt:string};
        return {data:await teacherStudentDelete(db,teacherId,a.studentId,a.expectedUpdatedAt)};
      }
      case "ccp_students_archive_preview": {
        const arg=args as {studentId:string};
        return {data:await teacherStudentArchivePreview(db,teacherId,arg.studentId)};
      }
      case "ccp_students_profile_edit": {
        const a=args as {studentId:string;expectedUpdatedAt:string;changes:Parameters<typeof teacherStudentPatch>[3]};
        return {data:await teacherStudentPatch(db,teacherId,a.studentId,a.changes,a.expectedUpdatedAt)};
      }
      case "ccp_dashboard_summary":
        return { data: await teacherDashboardSummary(db, teacherId) };
      case "ccp_notifications_list":
        return { data: await teacherNotificationsList(db, teacherId) };
      case "ccp_notifications_mark_read": {
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
      case "ccp_lessons_history_unified": {
        const a=args as Parameters<typeof teacherUnifiedLessonHistory>[2];
        return {data:await teacherUnifiedLessonHistory(db,teacherId,a)};
      }
      case "ccp_reports_workplace_summary": {
        const a = args as { workplaceId?: string|null; from: string; to: string; format: "json" | "csv" | "text"; outputLocale?:"en"|"he"|"ru" };
        try {
          const result = await workplaceTeachingReport(
            db,teacherId,a.workplaceId,a.from,a.to,a.outputLocale
          );
          if (a.format === "csv") return { data: { ...result, format: "csv", export: reportCsv(result.report,a.outputLocale) } };
          if (a.format === "text") return { data: { ...result, format: "text", export: reportText(result.report,a.outputLocale) } };
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
      case "ccp_chess_categories_create": {
        const a=args as {name:string;description?:string;sortOrder?:number};
        return {data:await chessCategoriesCreate(db,teacherId,a)};
      }
      case "ccp_chess_categories_update": {
        const a=args as {categoryId:string;name?:string;description?:string;sortOrder?:number};
        return {data:await chessCategoriesUpdate(db,teacherId,a.categoryId,a)};
      }
      case "ccp_chess_categories_delete_impact": {
        const a=args as {categoryId:string};
        return {data:await chessCategoriesDeleteImpact(db,teacherId,a.categoryId)};
      }
      case "ccp_chess_categories_delete": {
        const a=args as {categoryId:string;confirmed:true};
        return {data:await chessCategoriesDelete(db,teacherId,a.categoryId)};
      }
      case "ccp_chess_observations_update": {
        const a=args as {observationId:string;observation?:string;categoryId?:string;observedAt?:string};
        return {data:await chessObservationsUpdate(db,teacherId,a.observationId,a)};
      }
      case "ccp_material_links_unlink_impact": {
        const a=args as {linkId:string};
        return {data:await materialLinksUnlinkImpact(db,teacherId,a.linkId)};
      }
      case "ccp_material_links_unlink": {
        const a=args as Parameters<typeof materialLinksUnlink>[2];
        return {data:await materialLinksUnlink(db,teacherId,a)};
      }
      case "ccp_material_links_update": {
        const a=args as Parameters<typeof materialLinksUpdate>[2];
        return {data:await materialLinksUpdate(db,teacherId,a)};
      }
      case "ccp_chess_categories_list":
        return { data: await chessCategoriesList(db,teacherId) };
      case "ccp_chess_observations_list": {
        const a=args as {studentId:string;sessionId?:string};
        return { data: await chessObservationsList(db,teacherId,a.studentId,a.sessionId) };
      }
      case "ccp_chess_observations_propose": {
        const a=args as Parameters<typeof chessObservationsCreate>[2];
        return { data: await chessObservationsCreate(db,teacherId,a,"agent") };
      }
      case "ccp_materials_history_list": {
        const a=args as Parameters<typeof teacherMaterialHistory>[2];
        return {data:await teacherMaterialHistory(db,teacherId,a)};
      }
      case "ccp_materials_aggregate": {
        return {data:await teacherMaterialAggregate(db,teacherId,args as Parameters<typeof teacherMaterialAggregate>[2])};
      }
      case "ccp_material_defaults_list": {
        const a=args as Parameters<typeof teacherMaterialDefaultsList>[2];
        return {data:await teacherMaterialDefaultsList(db,teacherId,a)};
      }
      case "ccp_material_default_create": {
        return {data:await teacherMaterialDefaultCreate(db,teacherId,
          defaultCreateSchema.parse({...args,operation:"default.create"}))};
      }
      case "ccp_material_default_update": {
        return {data:await teacherMaterialDefaultUpdate(db,teacherId,
          defaultUpdateSchema.parse({...args,operation:"default.update"}))};
      }
      case "ccp_material_default_archive": {
        return {data:await teacherMaterialDefaultArchive(db,teacherId,
          defaultArchiveSchema.parse({...args,operation:"default.archive"}))};
      }
      case "ccp_materials_history_record": {
        const a=args as Parameters<typeof teacherMaterialRecord>[2];
        return {data:await teacherMaterialRecord(db,teacherId,a)};
      }
      case "ccp_materials_history_void": {
        const a=args as Parameters<typeof teacherMaterialVoid>[2];
        return {data:await teacherMaterialVoid(db,teacherId,a)};
      }
      case "ccp_materials_lesson_use_preview":
        return {data:await teacherMaterialInLessonPreview(db,teacherId,
          args as Parameters<typeof teacherMaterialInLessonPreview>[2])};
      case "ccp_materials_lesson_use_commit":
        return {data:await teacherMaterialInLessonCommit(db,teacherId,
          args as Parameters<typeof teacherMaterialInLessonCommit>[2])};
      case "ccp_material_links_list": {
        const a=args as Parameters<typeof materialLinksList>[2];
        return {data:await materialLinksList(db,teacherId,a)};
      }
      case "ccp_material_links_create": {
        const a=args as Parameters<typeof materialLinksCreate>[2];
        return {data:await materialLinksCreate(db,teacherId,a)};
      }
      case "ccp_workplaces_enrollments":
        return {data:await workplacesEnrollments(db,teacherId,(args as {workplaceId:string}).workplaceId)};
      case "ccp_credits_adjustment_preview":
        return {data:await teacherCreditAdjustmentPreview(db,teacherId,
          args as Parameters<typeof teacherCreditAdjustmentPreview>[2])};
      case "ccp_credits_adjustment_commit":
        return {data:await teacherCreditAdjustmentCommit(db,teacherId,
          args as Parameters<typeof teacherCreditAdjustmentCommit>[2])};
      case "ccp_workplaces_unenroll_preview": {
        const a=args as {workplaceId:string;studentId:string};
        return {data:await workplacesUnenrollPreview(db,teacherId,a.workplaceId,a.studentId)};
      }
      case "ccp_workplaces_unenroll": {
        const a=args as {workplaceId:string;studentId:string;
          expectedRevision?:number;idempotencyKey?:string;reason?:string};
        return {data:await workplacesUnenroll(db,teacherId,a.workplaceId,a.studentId,{
          expectedRevision:a.expectedRevision,idempotencyKey:a.idempotencyKey,reason:a.reason,
        })};
      }
      case "ccp_schedule_day_preview":
        return {data:await teacherScheduleDayPreview(db,teacherId,
          args as Parameters<typeof teacherScheduleDayPreview>[2])};
      case "ccp_students_resolve":
        return {data:await teacherStudentNamesResolve(db,teacherId,
          (args as {names:string[]}).names)};
      case "ccp_lessons_capture_commit_with_chapter":
        return {data:await teacherAtomicLessonChapterCommit(db,teacherId,
          args as Parameters<typeof teacherAtomicLessonChapterCommit>[2])};
      case "ccp_lessons_capture_preview":
        return {data:await teacherLessonCapturePreview(db,teacherId,
          args as Parameters<typeof teacherLessonCapturePreview>[2])};
      case "ccp_lessons_archived_recovery_preview":
        return {data:await teacherArchivedLessonRecoveryPreview(db,teacherId,
          args as Parameters<typeof teacherArchivedLessonRecoveryPreview>[2])};
      case "ccp_lessons_archived_recovery_commit":
        return {data:await teacherArchivedLessonRecoveryCommit(db,teacherId,
          args as Parameters<typeof teacherArchivedLessonRecoveryCommit>[2])};
      case "ccp_lessons_capture_completed":
        return {data:await teacherCompletedGroupCapture(db,teacherId,
          args as Parameters<typeof teacherCompletedGroupCapture>[2])};
      case "ccp_sessions_ad_hoc_create": {
        const a=args as {workplaceId:string;studentIds:string[];title:string;
          startsAt:string;durationMinutes:number;lessonNote:string;idempotencyKey:string};
        return {data:await sessionsAdHocCreate(db,teacherId,{
          ...a,requestId:a.idempotencyKey,
        })};
      }
      case "ccp_sessions_edit": {
        const a=args as {sessionId:string;changes:{title?:string;startsAt?:string;
          durationMinutes?:number;isHomeVisit?:boolean;lessonNote?:string;
          status?:"scheduled"|"completed"|"cancelled"};
          expectedUpdatedAt:string;idempotencyKey:string};
        const updated=await sessionsUpdate(db,teacherId,a.sessionId,{
          ...a.changes,expectedUpdatedAt:a.expectedUpdatedAt,requestId:a.idempotencyKey,
        });
        return {data:updated};
      }
      case "ccp_sessions_complete": {
        return {data:await sessionsComplete(db,teacherId,args as LessonCompletionInput)};
      }
      case "ccp_sessions_roster_preview": {
         const a=args as {sessionId:string};
         return {data:await teacherSessionRosterPreview(db,teacherId,a.sessionId)};
       }
       case "ccp_sessions_roster_correct": {
         const a=args as {sessionId:string;studentIds:string[];
           expectedUpdatedAt:string;idempotencyKey:string;reason:string};
         return {data:await teacherSessionRosterCorrect(db,teacherId,a.sessionId,a)};
       }
       case "ccp_sessions_roster_revisions_list": {
         const a=args as {sessionId:string;includePrivate:boolean;confirmed?:boolean};
         return {data:await teacherSessionRosterAudit(db,teacherId,a.sessionId,
           a.includePrivate&&a.confirmed===true)};
       }
       case "ccp_sessions_details": {
        const id=(args as {sessionId:string}).sessionId;
        const {data,error}=await db.from("teaching_sessions")
          .select("id,title,starts_at,duration_minutes,lesson_note,status,workplace_id,group_id,student_id,updated_at")
          .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
        if (error) throw new CoachError("DATABASE_ERROR",500,"Lesson lookup failed");
        if (!data) return {error:{code:"NOT_FOUND",message:"Lesson not found"}};
        return {data:{...data,participants:await sessionsParticipants(db,teacherId,id)}};
      }
      case "ccp_workplaces_list":
        return { data: await workplacesList(db, teacherId) };
      case "ccp_students_lifecycle_preview":
        return {data:await studentLifecyclePreview(db,teacherId,
          args as Parameters<typeof studentLifecyclePreview>[2])};
      case "ccp_students_lifecycle_commit":
        return {data:await studentLifecycleCommit(db,teacherId,
          args as Parameters<typeof studentLifecycleCommit>[2])};
      case "ccp_students_search": {
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
      case "ccp_groups_list":
        return { data: await groupsList(db, teacherId) };
      case "ccp_groups_members":
        return { data: await groupsMembers(db, teacherId, (args as {groupId:string}).groupId) };
      case "ccp_sessions_list": {
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
      case "ccp_sessions_participants":
        return { data: await sessionsParticipants(db, teacherId, (args as {sessionId:string}).sessionId) };
      case "ccp_attendance_preview": {
        const sid = (args as {sessionId:string}).sessionId;
        const [roster, register] = await Promise.all([
          sessionsParticipants(db, teacherId, sid),
          attendanceList(db, teacherId, sid),
        ]);
        return { data: { sessionId: sid, participants: roster, attendance: register,
          requiresConfirmation: true, bulkCommitAvailable: true } };
      }
      case "ccp_attendance_record": {
        const a=args as {sessionId:string;studentId:string;status:string;note:string;
          expectedUpdatedAt:string|null;idempotencyKey:string};
        return {data:await attendanceRecord(db,teacherId,{
          ...a,requestId:a.idempotencyKey,
        })};
      }
      case "ccp_attendance_bulk_record":
        return {data:await attendanceBulkRecord(db,teacherId,
          args as import("@/lib/lesson-completion").AttendanceBulkRecordInput)};
      case "ccp_sessions_note_update": {
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
    if (error instanceof StudyPreferenceError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof StudentRatingError||error instanceof StudyIndexError||
        error instanceof ChapterEvidenceError||error instanceof PuzzleSeriesError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof PuzzleReviewError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof LessonTimingError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof MaterialInLessonError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CompletedGroupCaptureError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof AtomicLessonChapterError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof LessonCapturePreviewError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof MaterialCatalogError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof MaterialHistoryError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof BulkLifecycleError||error instanceof HistoricalImportError)
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
    if (error instanceof CanonicalAttendanceError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof SessionNoteError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CanonicalPrivateSessionError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CanonicalSlotError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof PayerAssignmentError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof FederationError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CompensationAgreementError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof FinanceLedgerError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof WorkplaceContextError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof PortalGrantError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof ContactServiceError)
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
