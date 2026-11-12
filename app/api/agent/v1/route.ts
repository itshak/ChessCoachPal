import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import {
  CoachError,
  attendanceList, attendanceRecord,
  groupsCreate, groupsEnroll, groupsUnenroll, groupsList, groupsMembers,
  sessionsCreate, sessionsAdHocCreate, sessionsList, sessionsParticipants, studentsSearch,
  workplacesCreate, workplacesList, workplacesEnroll, workplacesUnenroll, workplacesEnrollments,
  studentsCreate, sessionsUpdate, sessionsComplete, assertTimezone,
} from "@/lib/server/coach-service";

import {
  chessCategoriesList, chessCategoriesCreate, chessCategoriesUpdate,
  chessCategoriesDeleteImpact, chessCategoriesDelete,
  chessObservationsList, chessObservationsCreate, chessObservationsUpdate, chessObservationsApprove,
 } from "@/lib/server/chess-learning";
import { chessUuid, categoryName, observationText, observationInput, observedAt,
 materialLinkListInput,materialLinkCreateInput,materialLinkUpdateInput,materialLinkUnlinkInput,
} from "@/lib/chess-learning";
import {materialLinksList,materialLinksCreate,materialLinksUpdate,
 materialLinksUnlinkImpact,materialLinksUnlink} from "@/lib/server/material-links";
import {lessonCompletionSchema} from "@/lib/lesson-completion";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const shortName = z.string().trim().min(1).max(120);
const calls = z.discriminatedUnion("action", [
  z.object({ action: z.literal("workplaces.list") }),
  z.object({ action: z.literal("workplaces.create"), name: shortName,
    timezone: z.string().trim().min(1).max(80).default("UTC"),
    currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
    locale: z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).default("en"),
    policy: z.record(z.string(), z.unknown()).default({}) }),
  z.object({ action: z.literal("workplaces.update"), workplaceId: uuid,
    name: shortName.optional(), timezone: z.string().trim().min(1).max(80).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    locale: z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).optional(),
    policy: z.record(z.string(), z.unknown()).optional(),
    expectedUpdatedAt:z.string().datetime({offset:true}),idempotencyKey:uuid,
  }).strict().refine(v=>v.name!==undefined||v.timezone!==undefined||
    v.currency!==undefined||v.locale!==undefined||v.policy!==undefined,{
    message:"At least one workplace field must change",
  }),
  z.object({ action: z.literal("workplaces.enroll"), workplaceId: uuid, studentId: uuid }),
  z.object({ action: z.literal("workplaces.unenroll"), workplaceId: uuid, studentId: uuid, confirmed: z.literal(true) }),
  z.object({ action: z.literal("workplaces.enrollments"), workplaceId: uuid }),
  z.object({ action: z.literal("students.create"), name: shortName,
    level: z.string().trim().max(120).nullable().optional() }),
  z.object({ action: z.literal("students.update"), studentId: uuid,
    name: shortName.optional(), level: z.string().trim().max(120).nullable().optional(),
    expectedUpdatedAt:z.string().datetime({offset:true}),idempotencyKey:uuid,
  }).strict().refine(v=>v.name!==undefined||v.level!==undefined,{
    message:"At least one student field must change",
  }),
  z.object({ action: z.literal("students.search"),
    query: z.string().trim().max(80).default("") }),
  z.object({ action: z.literal("groups.list") }),
  z.object({ action: z.literal("groups.create"), workplaceId: uuid, name: shortName }),
  z.object({ action: z.literal("groups.update"), groupId: uuid, workplaceId: uuid, name: shortName,
    expectedUpdatedAt:z.string().datetime({offset:true}),idempotencyKey:uuid }).strict(),
  z.object({ action: z.literal("groups.enroll"), groupId: uuid, studentId: uuid }),
  z.object({ action: z.literal("groups.unenroll"), groupId: uuid, studentId: uuid }),
  z.object({ action: z.literal("groups.members"), groupId: uuid }),
  z.object({ action: z.literal("sessions.list") }),
  z.object({ action: z.literal("sessions.create"),
    workplaceId: uuid, groupId: uuid.optional(), studentId: uuid.optional(),
    title: z.string().trim().min(1).max(160),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(480),
    lessonNote: z.string().max(10000).default(""), requestId: uuid,
  }).refine(v => Boolean(v.groupId) !== Boolean(v.studentId), {
    message: "Provide exactly one of groupId or studentId",
  }),
  z.object({ action: z.literal("sessions.createAdHoc"),workplaceId:uuid,
    studentIds:z.array(uuid).min(2).max(50),title:z.string().trim().min(1).max(160),
    startsAt:z.string().datetime({offset:true}),
    durationMinutes:z.number().int().min(15).max(480),
    lessonNote:z.string().max(10000).default(""),requestId:uuid,
  }),
  z.object({ action: z.literal("sessions.update"), sessionId: uuid,
    title: z.string().trim().min(1).max(160).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.number().int().min(15).max(480).optional(),
    lessonNote: z.string().max(10000).optional(),
    status: z.enum(["scheduled", "cancelled"]).optional(),
  }),
  lessonCompletionSchema.safeExtend({action:z.literal("sessions.complete")}),
  z.object({ action: z.literal("sessions.participants"), sessionId: uuid }),
  z.object({ action: z.literal("attendance.list"), sessionId: uuid }),
  z.object({ action: z.literal("chess.categories.list") }),
  z.object({ action: z.literal("chess.categories.create"), name:categoryName,
    description:z.string().max(500).optional(), sortOrder:z.number().int().min(0).max(10000).optional() }),
  z.object({ action: z.literal("chess.categories.update"), categoryId:chessUuid,
    name:categoryName.optional(), description:z.string().max(500).optional(),
    sortOrder:z.number().int().min(0).max(10000).optional() }),
  z.object({ action:z.literal("chess.categories.deleteImpact"), categoryId:chessUuid }),
  z.object({ action:z.literal("chess.categories.delete"), categoryId:chessUuid,
    confirmed:z.literal(true) }),
  z.object({ action: z.literal("chess.observations.list"), studentId:chessUuid,
    sessionId:chessUuid.optional() }),
  observationInput.extend({ action:z.literal("chess.observations.create") }),
  observationInput.extend({ action:z.literal("chess.observations.propose") }),
  z.object({ action:z.literal("chess.observations.update"), observationId:chessUuid,
    observation:observationText.optional(), categoryId:chessUuid.optional(),
    observedAt:observedAt.optional() }),
  z.object({ action:z.literal("chess.observations.approve"), observationId:chessUuid }),
  materialLinkListInput.safeExtend({action:z.literal("materials.links.list")}),
  materialLinkCreateInput.safeExtend({action:z.literal("materials.links.create")}),
  z.object({action:z.literal("materials.links.unlinkImpact"),linkId:chessUuid}),
  materialLinkUnlinkInput.safeExtend({action:z.literal("materials.links.unlink")}),
  materialLinkUpdateInput.safeExtend({action:z.literal("materials.links.update")}),
  z.object({ action: z.literal("attendance.record"),
    sessionId: uuid, studentId: uuid,
    status: z.enum(["present", "absent", "late", "excused", "student_cancelled", "teacher_cancelled"]),
    note: z.string().max(5000).default(""),
    noticeAt: z.string().datetime({offset:true}).optional(),
    cancelReason: z.string().max(1000).optional(),
  }),
]);

const toolNames = [
  "workplaces.list", "workplaces.create", "workplaces.update", "workplaces.enroll", "workplaces.unenroll", "workplaces.enrollments",
  "students.search", "students.create", "students.update",
  "groups.list", "groups.create", "groups.update", "groups.enroll", "groups.unenroll", "groups.members",
  "sessions.list", "sessions.create", "sessions.createAdHoc", "sessions.update", "sessions.complete", "sessions.participants",
  "attendance.list", "attendance.record",
  "chess.categories.list","chess.categories.create","chess.categories.update",
  "chess.categories.deleteImpact","chess.categories.delete",
  "chess.observations.list","chess.observations.create","chess.observations.propose",
  "chess.observations.update","chess.observations.approve",
  "materials.links.list","materials.links.create","materials.links.update",
  "materials.links.unlinkImpact","materials.links.unlink",
] as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Current-schema SQL writer shared with delegated MCP: same owner and
 * optimistic revision, one durable request receipt and no silent overwrite.
 */
async function writeRevisionedCoaching(
 db:SupabaseClient,operation:"students.update"|"workplaces.update"|"groups.update",
 payload:Record<string,unknown>,revision:string,requestId:string
){
 const {data,error}=await db.rpc("agent_coaching_mutate",{
  p_operation:operation,p_payload:payload,
  p_expected_updated_at:revision,
  p_idempotency_key:requestId,p_client_id:"teacher-website",
 });
 if(error){
  const m=error.message??"";
  const conflict=error.code==="23505"||/CONFLICT|23505|23P01/.test(m);
  const missing=/NOT_FOUND/.test(m)&&!conflict;
  throw new CoachError(conflict?"CONFLICT":missing?"NOT_FOUND":"VALIDATION_ERROR",
   conflict?409:missing?404:400,conflict?
   "The record changed or the request key was reused with changed terms":
   missing?"Record not found":"Reviewed coaching mutation was rejected");
 }
 return data;
}

async function teacherForRequest(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (authorization) {
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
    if (!match) return null;
    const db = createAuthClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authorization } } }
    );
    // getUser verifies signature and expiry server-side, not just JWT parsing.
    const { data: { user }, error } = await db.auth.getUser(match[1]);
    return error || !user ? null : { db, teacherId: user.id, bearer: true };
  }
  const db = await createCookieClient();
  const { data: { user }, error } = await db.auth.getUser();
  return error || !user ? null : { db, teacherId: user.id, bearer: false };
}

export async function GET(req: NextRequest) {
  const auth = await teacherForRequest(req);
  if (!auth) return json({ error: { code: "UNAUTHENTICATED" } }, 401);
  return json({ name: "ChessCoachPal", version: "0.1",
    status: "experimental", tools: toolNames,
    warning: "This is the website Supabase-session API; external agents use delegated OAuth/MCP tools." });
}

export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: { code: "VALIDATION_ERROR", message: "JSON required" } }, 415);
  }
  const auth = await teacherForRequest(req);
  if (!auth) return json({ error: { code: "UNAUTHENTICATED" } }, 401);
  if (!auth.bearer) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) {
      return json({ error: { code: "FORBIDDEN" } }, 403);
    }
  }
  const parsed = calls.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({
    error: { code: "VALIDATION_ERROR",
      issues: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })) },
  }, 400);
  const call = parsed.data;
  // Model-originated credentials may propose or correct observations, but
  // MUST NOT assert teacher-verification provenance either by approval
  // or by creating a record as if it were manually teacher-attested.
  if((call.action==="chess.observations.approve" ||
      call.action==="chess.observations.create") && auth.bearer)
    return json({error:{code:"BROWSER_APPROVAL_REQUIRED",
      message:"Teacher approval must be completed in the signed-in website"}},403);
  const { db, teacherId } = auth;
  try {
    let result: unknown;
    switch (call.action) {
      case "workplaces.list":
        result = await workplacesList(db, teacherId); break;
      case "workplaces.create":
        assertTimezone(call.timezone);
        result = await workplacesCreate(db, teacherId, call.name, call.timezone,
          call.currency, call.locale, call.policy); break;
      case "workplaces.update": {
        if(call.timezone!==undefined)assertTimezone(call.timezone);
        result=await writeRevisionedCoaching(db,"workplaces.update",{
          workplaceId:call.workplaceId,
          ...(call.name!==undefined?{name:call.name}:{}),
          ...(call.timezone!==undefined?{timezone:call.timezone}:{}),
          ...(call.currency!==undefined?{currency:call.currency}:{}),
          ...(call.locale!==undefined?{locale:call.locale}:{}),
          ...(call.policy!==undefined?{policy:call.policy}:{}),
          expectedUpdatedAt:call.expectedUpdatedAt,idempotencyKey:call.idempotencyKey,
        },call.expectedUpdatedAt,call.idempotencyKey);
        break;
      }
      case "workplaces.enroll":
        result = await workplacesEnroll(db, teacherId, call.workplaceId, call.studentId); break;
      case "workplaces.unenroll":
        result = await workplacesUnenroll(db, teacherId, call.workplaceId, call.studentId); break;
      case "workplaces.enrollments":
        result = await workplacesEnrollments(db, teacherId, call.workplaceId); break;
      case "students.search":
        result = await studentsSearch(db, teacherId, call.query); break;
      case "students.create":
        result = await studentsCreate(db, teacherId, call.name, call.level); break;
      case "students.update": {
        result=await writeRevisionedCoaching(db,"students.update",{
          studentId:call.studentId,
          ...(call.name!==undefined?{name:call.name}:{}),
          ...(call.level!==undefined?{level:call.level}:{}),
          expectedUpdatedAt:call.expectedUpdatedAt,idempotencyKey:call.idempotencyKey,
        },call.expectedUpdatedAt,call.idempotencyKey);
        break;
      }
      case "groups.list":
        result = await groupsList(db, teacherId); break;
      case "groups.create":
        result = await groupsCreate(db, teacherId, call.workplaceId, call.name); break;
      case "groups.update": {
        result=await writeRevisionedCoaching(db,"groups.update",{
          groupId:call.groupId,workplaceId:call.workplaceId,name:call.name,
          expectedUpdatedAt:call.expectedUpdatedAt,idempotencyKey:call.idempotencyKey,
        },call.expectedUpdatedAt,call.idempotencyKey);
        break;
      }
      case "groups.enroll":
        result = await groupsEnroll(db, teacherId, call.groupId, call.studentId); break;
      case "groups.unenroll":
        result = await groupsUnenroll(db, teacherId, call.groupId, call.studentId); break;
      case "groups.members":
        result = await groupsMembers(db, teacherId, call.groupId); break;
      case "sessions.list":
        result = await sessionsList(db, teacherId); break;
      case "sessions.create":
        result = await sessionsCreate(db, teacherId, call); break;
      case "sessions.update":
        result = await sessionsUpdate(db, teacherId, call.sessionId, call); break;
      case "sessions.complete":
        result = await sessionsComplete(db,teacherId,call);break;
      case "sessions.createAdHoc":
        result=await sessionsAdHocCreate(db,teacherId,call);break;
      case "sessions.participants":
        result = await sessionsParticipants(db, teacherId, call.sessionId); break;
      case "attendance.list":
        result = await attendanceList(db, teacherId, call.sessionId); break;
      case "attendance.record":
        result = await attendanceRecord(db, teacherId, call); break;
      case "chess.categories.list":
        result = await chessCategoriesList(db,teacherId); break;
      case "chess.categories.create":
        result = await chessCategoriesCreate(db,teacherId,call); break;
      case "chess.categories.update":
        result = await chessCategoriesUpdate(db,teacherId,call.categoryId,call); break;
      case "chess.categories.deleteImpact":
        result = await chessCategoriesDeleteImpact(db,teacherId,call.categoryId);break;
      case "chess.categories.delete":
        result = await chessCategoriesDelete(db,teacherId,call.categoryId);break;
      case "chess.observations.list":
        result = await chessObservationsList(db,teacherId,call.studentId,call.sessionId); break;
      case "chess.observations.create":
        result = await chessObservationsCreate(db,teacherId,call,"teacher"); break;
      case "chess.observations.propose":
        result = await chessObservationsCreate(db,teacherId,call,"agent"); break;
      case "chess.observations.update":
        result = await chessObservationsUpdate(db,teacherId,call.observationId,call); break;
      case "chess.observations.approve":
        result = await chessObservationsApprove(db,teacherId,call.observationId); break;
      case "materials.links.list":
        result=await materialLinksList(db,teacherId,call);break;
      case "materials.links.create":
        result=await materialLinksCreate(db,teacherId,call);break;
      case "materials.links.unlinkImpact":
        result=await materialLinksUnlinkImpact(db,teacherId,call.linkId);break;
      case "materials.links.unlink":
        result=await materialLinksUnlink(db,teacherId,call);break;
      case "materials.links.update":
        result=await materialLinksUpdate(db,teacherId,call);break;
    }
    return json({ ok: true, data: result }, call.action.endsWith(".create") ? 201 : 200);
  } catch (error) {
    if (error instanceof CoachError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
    // Do not serialize database details, child data, or authorization headers.
    return json({ error: { code: "DATABASE_ERROR", message: "Operation failed" } }, 500);
  }
}
