import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CoachError, attendanceList, groupsList, groupsMembers,
  sessionsList, sessionsParticipants, studentsSearch, workplacesList, workplacesEnrollments,
} from "@/lib/server/coach-service";

import { chessCategoriesList, chessObservationsList, chessObservationsCreate,
  chessResourcesList, chessResourcesCreate } from "@/lib/server/chess-learning";
import { chessUuid, observationInput, resourceInput } from "@/lib/chess-learning";
import { reportCsv, reportText } from "@/lib/coaching-report";
import { ReportServiceError, workplaceTeachingReport } from "@/lib/server/coaching-report-service";
import { teacherDashboardSummary, teacherNotificationsList, teacherNotificationsMarkRead,
  TeacherOverviewError } from "@/lib/server/teacher-overview-service";

import { teacherStudentProfile, teacherStudentsRoster, teacherStudentPatch, StudentProfileError } from "@/lib/server/student-profile-service";
import { studentUpdateSchema } from "@/lib/server/api-schemas";
import { assertWithinHostedLimit } from "@/lib/server/entitlements";
const safeStudentProfile = (row: Record<string,unknown>) => ({
  id:row.id,name:row.name,name_aliases:row.name_aliases,level:row.level,
  strength:row.strength,lichess_username:row.lichess_username,chesscom_username:row.chesscom_username,
  lichess_rating:row.lichess_rating,chesscom_rating:row.chesscom_rating,
  archived_at:row.archived_at,updated_at:row.updated_at,
});
import {
 skillDimensionsList, skillDimensionsCreate, skillDimensionsUpdate, skillDimensionsDelete,
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
 teacherEventDeleteImpact,teacherEventDelete,teacherEventInviteEmail,TeacherEventError,
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
const uuid = z.string().uuid();
const eventChanges=z.object({
  title:z.string().trim().min(1).max(200).optional(),
  description:z.string().max(10000).optional(),
  location:z.string().max(1000).optional(),
  startsAt:z.string().datetime({offset:true}).optional(),
  endsAt:z.string().datetime({offset:true}).nullable().optional(),
  sendReminder:z.boolean().optional(),
  studentIds:z.array(uuid).max(200).optional(),
  repertoireByStudent:z.record(uuid,z.string().max(10000)).optional(),
}).strict();
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
 notifyInApp:z.boolean().optional(),
 notifyEmailPortalCancel:z.boolean().optional(),
 notifyEmailInvoicePaid:z.boolean().optional(),
 bccFamilyEmails:z.boolean().optional(),
 bccEmail:z.string().max(320).nullable().optional(),
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
    name:"ccp_v1_billing_manual_payment_record",
    description:"Record an actual payment already received outside ChessCoachPal against a teacher-owned invoice. This tool does not charge a card. Use a new idempotencyKey per real-world payment, reuse it on retries, verify invoice balance first and require explicit teacher confirmation.",
    schema:z.object({invoiceId:uuid,amountCents:z.number().int().min(1).optional(),
      note:z.string().max(500).optional(),idempotencyKey:uuid,confirmed:z.literal(true)}).strict(),
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
    description:"Edit the notes or replace every line of one identified draft invoice. Verify totals and lesson IDs before explicit confirmation; paid/sent invoices cannot be edited.",
    schema:z.object({invoiceId:uuid,changes:z.object({
      notes:z.string().max(2000).optional(),
      items:z.array(z.object({
        id:uuid.optional(),lessonId:uuid.nullable().optional(),
        description:z.string().trim().min(1).max(500),
        quantity:z.number().int().min(1).max(10000),
        unitCents:z.number().int().min(0).max(100000000),
        amountCents:z.number().int().min(0).max(100000000),
      }).strict()).max(100).optional(),
    }).strict(),confirmed:z.literal(true)}).strict()
      .refine(v=>Object.keys(v.changes).length>0,"Changes required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoice_void",
    description:"Void a draft or sent invoice after teacher confirms its ID. Paid invoices or already redeemed prepaid credits cannot be voided.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_billing_invoice_delete",
    description:"Permanently delete one identified draft or void invoice after confirmation. Never remove paid/sent invoice history.",
    schema:z.object({invoiceId:uuid,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
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
    description:"Read the teacher's studio rules, rates, cancellation policies and billing settings. Secrets and payment QR data are redacted.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_studio_policy_update",
    description:"Edit studio rates, cancellation rules, timezone, invoice settings and communication preferences with explicit confirmation. API keys and payment secrets are website-only secure inputs.",
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
    description:"Create an event for named students, with optional repertoires and RSVP invitations in pending state. DOES NOT email without a separate confirmed send tool.",
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
    description:"Confirm one private lesson's attendance, cancellation, no-show or deliberate clearing. Notification emails require notifyFamily=true plus explicit confirmedEmail=true; default is no email.",
    schema:z.object({lessonId:uuid,
      status:z.enum(["attended","teacher_cancel","student_cancel","no_show"]).nullable(),
      noticeChoice:z.enum(["now","timely","late","custom"]).optional(),
      noticeAt:z.string().datetime({offset:true}).nullable().optional(),
      cancelNote:z.string().max(1000).optional(),
      notifyFamily:z.boolean().default(false),confirmedEmail:z.literal(true).optional(),
      confirmed:z.literal(true),
    }).strict().refine(v=>!v.notifyFamily||v.confirmedEmail===true,"Email requires explicit confirmation"),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_calendar_attendance_bulk",
    description:"Bulk record 1–50 private lesson attended/no-show/teacher-cancel outcomes, per-ID failures reported. Email notifications require explicit confirmedEmail=true.",
    schema:z.object({ids:z.array(uuid).min(1).max(50),status:z.enum(["attended","no_show","teacher_cancel"]),
      notifyFamily:z.boolean().default(false),confirmedEmail:z.literal(true).optional(),
      confirmed:z.literal(true),
    }).strict().refine(v=>!v.notifyFamily||v.confirmedEmail===true,"Email requires explicit confirmation"),
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
      to:z.string().date().optional(),offset:z.number().int().min(0).default(0),
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
    description:"Invalidate an existing family-portal link and create a fresh one. Old links immediately stop working. New secret is NEVER returned to the model; view the URL securely on the website.",
    schema:z.object({guardianId:uuid,confirmed:z.literal(true)}).strict(),scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_skill_dimensions_list",
    description:"List teacher-owned 1–5 assessment dimensions; the website uses the same chess-specific dimensions.",
    schema:z.object({}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_skill_dimensions_create",
    description:"Create a teacher-owned skill dimension after teacher approval; avoid duplicates.",
    schema:z.object({name:z.string().trim().min(1).max(120),confirmed:z.literal(true)}).strict(),
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
    description:"Preview how many historical assessments would be cascaded before removing a skill dimension.",
    schema:z.object({dimensionId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_skill_dimensions_delete",
    description:"PERMANENTLY delete the dimension and its assessment history. Require confirmed=true and the exact assessment count from the preview; never decide for the coach.",
    schema:z.object({dimensionId:uuid,expectedAssessmentCount:z.number().int().min(0),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_student_skill_assessments_list",
    description:"Read timestamped 1–5 skill assessment history for an identified owned student, including archived learners.",
    schema:z.object({studentId:uuid}).strict(),scope:"coach:read",readOnly:true,
  },
  {
    name:"ccp_v1_student_skill_assessments_record",
    description:"Append a confirmed set of 1–5 skill assessments for an identified student. Dates are in the studio's configured timezone.",
    schema:z.object({studentId:uuid,ratings:z.array(z.object({
      dimensionId:uuid,rating:z.number().int().min(1).max(5),note:z.string().max(2000).optional(),
    }).strict()).min(1).max(20),confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_v1_students_roster",
    description: "Page through the teacher's complete learner roster, including historical archived students if requested. Includes aliases, chess strength, teacher-recorded provider ratings, and revision timestamps; omits private notes and guardian contact data.",
    schema: z.object({query:z.string().trim().max(80).optional(),includeArchived:z.boolean().default(false),
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
    name: "ccp_v1_students_profile_edit",
    description: "Edit one student's chess handles, aliases, strength (1-10), teacher-entered ratings, lesson rates, private notes, birthdate, family, or archive state. Use the latest updated_at revision and confirm any privacy-sensitive change; reconcile future commitments before archiving. Reload after conflicts; do not automatically retry a mutation.",
    schema:z.object({studentId:uuid,expectedUpdatedAt:instant,changes:studentUpdateSchema,
      confirmed:z.literal(true)}).strict().refine(v=>Object.keys(v.changes).length>0,"Changes required"),
    scope:"coach:write",readOnly:false,
  },
  {
    name: "ccp_v1_students_search",
    description: "Search only your teacher-owned students. If NEEDS_RESOLUTION is returned ask the teacher which ID they mean before writing.",
    schema: z.object({ query: searchText }).strict(), scope: "coach:read", readOnly: true,
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
      status: z.enum(["present","absent","late","excused"]),
      note: z.string().max(5000).default(""),
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
    name: "ccp_v1_chess_resources_list",
    description: "Read saved Lichess Study and HTTPS resource references, not provider contents.",
    schema: z.object({studentId:chessUuid.optional(),sessionId:chessUuid.optional()}).strict()
      .refine(v => Boolean(v.studentId || v.sessionId), "Choose a student or session"),
    scope: "coach:read", readOnly: true,
  },
  {
    name: "ccp_v1_chess_resources_link",
    description: "Save a specific HTTPS learning resource or Lichess Study link for a student/session. Does not fetch provider contents; confirm the teacher's choice.",
    schema: resourceInput, scope: "coach:write", readOnly: false,
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
    description:"Create one teacher-owned learner. Confirm the name and use a fresh idempotency key.",
    schema:z.object({name:shortName,level:z.string().trim().max(120).nullable().optional(),...mutation}).strict(),
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
    name:"ccp_v1_sessions_reschedule",
    description:"Reschedule an identified scheduled lesson; requires its latest revision, explicit offset and confirmation.",
    schema:z.object({sessionId:uuid,startsAt:instant,
      durationMinutes:z.number().int().min(15).max(480),...revision,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
  },
  {
    name:"ccp_v1_sessions_cancel",
    description:"Cancel ONE identified scheduled lesson after confirmation. Does not delete history.",
    schema:z.object({sessionId:uuid,...revision,confirmed:z.literal(true)}).strict(),
    scope:"coach:write",readOnly:false,
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
      if (name === "ccp_v1_students_create") {
        const check=await assertWithinHostedLimit(db,teacherId,"students");
        if (!check.allowed) return {error:{code:"HOSTED_LIMIT_REACHED",message:check.message ?? "Hosted active-student limit reached"}};
      }
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
        const code = /CONFLICT|23505|23P01/.test(msg)?"CONFLICT":
          /NOT_FOUND/.test(msg)?"NOT_FOUND":"VALIDATION_ERROR";
        return {error:{code,message:"Mutation rejected. Re-read the authorized record and verify IDs, revision, and schedule."}};
      }
      return {data};
    }
    switch (name) {
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
        const a=args as {invoiceId:string};
        return {data:await teacherInvoiceVoid(db,teacherId,a.invoiceId)};
      }
      case "ccp_v1_billing_invoice_delete": {
        const a=args as {invoiceId:string};
        return {data:await teacherInvoiceDelete(db,teacherId,a.invoiceId)};
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
        const p=await teacherPolicyView(db,teacherId);
        return {data:{...p,payment_qr_code:null,
          paymentQrCodeConfigured:Boolean(p.payment_qr_code)}};
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
          noticeChoice?:"now"|"timely"|"late"|"custom";noticeAt?:string|null;cancelNote?:string};
        const user=a.notifyFamily?(await db.auth.getUser()).data.user:null;
        return {data:await calendarAttendanceWrite(db,teacherId,a.lessonId,a,{
          origin:a.notifyFamily?oauthOrigin():"",
          teacherEmail:user?.email,
        })};
      }
      case "ccp_v1_calendar_attendance_bulk": {
        const a=args as {ids:string[];status:"attended"|"no_show"|"teacher_cancel";notifyFamily:boolean};
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
        const a=args as {guardianId:string};
        const rotated=await guardianRotatePortalToken(db,teacherId,a.guardianId);
        return {data:{ok:true,id:rotated.id,secretNotReturned:true}};
      }
      case "ccp_v1_skill_dimensions_list":
        return {data:await skillDimensionsList(db,teacherId)};
      case "ccp_v1_skill_dimensions_create": {
        const a=args as {name:string};
        return {data:await skillDimensionsCreate(db,teacherId,a.name)};
      }
      case "ccp_v1_skill_dimensions_update": {
        const a=args as {dimensionId:string;name:string};
        return {data:await skillDimensionsUpdate(db,teacherId,a.dimensionId,a.name)};
      }
      case "ccp_v1_skill_dimensions_delete_impact": {
        const a=args as {dimensionId:string};
        const {data,error}=await db.from("skill_dimensions").select("id")
          .eq("teacher_id",teacherId).eq("id",a.dimensionId).maybeSingle();
        if(error) throw new TeacherSkillsError(500,"DATABASE_ERROR","Skill lookup failed");
        if(!data) throw new TeacherSkillsError(404,"NOT_FOUND","Skill dimension not found");
        const {count,error:countError}=await db.from("skill_assessments")
          .select("id",{count:"exact",head:true}).eq("dimension_id",a.dimensionId);
        if(countError) throw new TeacherSkillsError(500,"DATABASE_ERROR","Skill history unavailable");
        return {data:{dimensionId:a.dimensionId,assessmentCount:count??0}};
      }
      case "ccp_v1_skill_dimensions_delete": {
        const a=args as {dimensionId:string;expectedAssessmentCount:number};
        const {data,error}=await db.from("skill_dimensions").select("id")
          .eq("teacher_id",teacherId).eq("id",a.dimensionId).maybeSingle();
        if(error) throw new TeacherSkillsError(500,"DATABASE_ERROR","Skill lookup failed");
        if(!data) throw new TeacherSkillsError(404,"NOT_FOUND","Skill dimension not found");
        const {count,error:countError}=await db.from("skill_assessments")
          .select("id",{count:"exact",head:true}).eq("dimension_id",a.dimensionId);
        if(countError) throw new TeacherSkillsError(500,"DATABASE_ERROR","Skill history unavailable");
        if(count!==a.expectedAssessmentCount)
          return {error:{code:"CONFLICT",message:"Assessment count changed. Re-preview the deletion impact."}};
        return {data:await skillDimensionsDelete(db,teacherId,a.dimensionId)};
      }
      case "ccp_v1_student_skill_assessments_list": {
        const a=args as {studentId:string};
        return {data:await studentSkillAssessmentsList(db,teacherId,a.studentId)};
      }
      case "ccp_v1_student_skill_assessments_record": {
        const a=args as {studentId:string;ratings:Parameters<typeof studentSkillAssessmentsRecord>[3]};
        return {data:await studentSkillAssessmentsRecord(db,teacherId,a.studentId,a.ratings)};
      }
      case "ccp_v1_students_roster": {
        const a=args as {query?:string;includeArchived:boolean;offset:number;limit:number};
        const result=await teacherStudentsRoster(db,teacherId,a);
        return {data:{students:result.students.map(safeStudentProfile),nextOffset:result.nextOffset}};
      }
      case "ccp_v1_students_profile": {
        const a=args as {studentId:string;includePrivate:boolean;confirmed?:boolean};
        const profile=await teacherStudentProfile(db,teacherId,a.studentId);
        return {data:a.includePrivate && a.confirmed ? profile : safeStudentProfile(profile)};
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
      case "ccp_v1_chess_resources_list": {
        const a=args as {studentId?:string;sessionId?:string};
        return { data: await chessResourcesList(db,teacherId,a) };
      }
      case "ccp_v1_chess_resources_link": {
        const a=args as Parameters<typeof chessResourcesCreate>[2];
        return { data: await chessResourcesCreate(db,teacherId,a) };
      }
      case "ccp_v1_workplaces_enrollments":
        return {data:await workplacesEnrollments(db,teacherId,(args as {workplaceId:string}).workplaceId)};
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
        const a = args as {sessionId:string;studentId:string;status:string;note:string;expectedUpdatedAt:string;idempotencyKey:string};
        const { data, error } = await db.rpc("agent_record_attendance", {
          p_session_id: a.sessionId, p_student_id: a.studentId, p_status: a.status,
          p_note: a.note, p_expected_updated_at: a.expectedUpdatedAt,
          p_idempotency_key: a.idempotencyKey,
        });
        if (error) return { error: { code: error.message.includes("CONFLICT") ? "CONFLICT" : "VALIDATION_ERROR",
          message: "Attendance was not changed. Re-read the session and verify the expected revision and student." } };
        return { data };
      }
      case "ccp_v1_sessions_note_update": {
        const a = args as {sessionId:string;lessonNote:string;expectedUpdatedAt:string;idempotencyKey:string};
        const { data, error } = await db.rpc("agent_update_session_note", {
          p_session_id: a.sessionId, p_lesson_note: a.lessonNote,
          p_expected_updated_at: a.expectedUpdatedAt, p_idempotency_key: a.idempotencyKey,
        });
        if (error) return { error: { code: error.message.includes("CONFLICT") ? "CONFLICT" : "VALIDATION_ERROR",
          message: "Session note was not changed. Re-read the session and expected revision." } };
        return { data };
      }
    }
    return { error: { code: "NOT_FOUND", message: "Unknown tool" } };
  } catch (error) {
    if (error instanceof ManualPaymentError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CreditServiceError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof ConnectionError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof InvoiceActionError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof TeacherBillingError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof TeacherEventError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof LegacyAttendanceError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CalendarError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof GuardianServiceError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof TeacherSkillsError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof StudentProfileError)
      return {error:{code:error.code,message:error.message}};
    if (error instanceof CoachError)
      return { error: { code: error.code, message: error.message } };
    return { error: { code: "DATABASE_ERROR", message: "Operation failed" } };
  }
}
