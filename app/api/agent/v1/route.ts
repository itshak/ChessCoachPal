import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import {
  CoachError,
  attendanceList, attendanceRecord,
  groupsCreate, groupsEnroll, groupsList, groupsMembers,
  sessionsCreate, sessionsList, sessionsParticipants, studentsSearch,
  workplacesCreate, workplacesList,
} from "@/lib/server/coach-service";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const shortName = z.string().trim().min(1).max(120);
const calls = z.discriminatedUnion("action", [
  z.object({ action: z.literal("workplaces.list") }),
  z.object({ action: z.literal("workplaces.create"), name: shortName,
    timezone: z.string().trim().min(1).max(80).default("UTC"),
    currency: z.string().regex(/^[A-Z]{3}$/).default("USD") }),
  z.object({ action: z.literal("students.search"),
    query: z.string().trim().max(80).default("") }),
  z.object({ action: z.literal("groups.list") }),
  z.object({ action: z.literal("groups.create"), workplaceId: uuid, name: shortName }),
  z.object({ action: z.literal("groups.enroll"), groupId: uuid, studentId: uuid }),
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
  z.object({ action: z.literal("sessions.participants"), sessionId: uuid }),
  z.object({ action: z.literal("attendance.list"), sessionId: uuid }),
  z.object({ action: z.literal("attendance.record"),
    sessionId: uuid, studentId: uuid,
    status: z.enum(["present", "absent", "late", "excused"]),
    note: z.string().max(5000).default(""),
  }),
]);

const toolNames = [
  "workplaces.list", "workplaces.create", "students.search",
  "groups.list", "groups.create", "groups.enroll", "groups.members",
  "sessions.list", "sessions.create", "sessions.participants", "attendance.list", "attendance.record",
] as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
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
    warning: "Supabase-session authentication only; OAuth/MCP connectors not implemented." });
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
  const { db, teacherId } = auth;
  try {
    let result: unknown;
    switch (call.action) {
      case "workplaces.list":
        result = await workplacesList(db, teacherId); break;
      case "workplaces.create":
        result = await workplacesCreate(db, teacherId, call.name, call.timezone, call.currency); break;
      case "students.search":
        result = await studentsSearch(db, teacherId, call.query); break;
      case "groups.list":
        result = await groupsList(db, teacherId); break;
      case "groups.create":
        result = await groupsCreate(db, teacherId, call.workplaceId, call.name); break;
      case "groups.enroll":
        result = await groupsEnroll(db, teacherId, call.groupId, call.studentId); break;
      case "groups.members":
        result = await groupsMembers(db, teacherId, call.groupId); break;
      case "sessions.list":
        result = await sessionsList(db, teacherId); break;
      case "sessions.create":
        result = await sessionsCreate(db, teacherId, call); break;
      case "sessions.participants":
        result = await sessionsParticipants(db, teacherId, call.sessionId); break;
      case "attendance.list":
        result = await attendanceList(db, teacherId, call.sessionId); break;
      case "attendance.record":
        result = await attendanceRecord(db, teacherId, call); break;
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
