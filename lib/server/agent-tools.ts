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

const uuid = z.string().uuid();
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
    name: "ccp_v1_reports_workplace_summary",
    description: "Read a teacher-owned workplace's date-range sessions and attendance totals, with optional CSV or text export. The same server calculation powers the website. Instructor minutes count each group lesson once. No student names or notes in this aggregate.",
    schema: z.object({
      workplaceId: uuid,
      from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
      to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
      format: z.enum(["json", "csv", "text"]).default("json"),
    }).strict(),
    scope: "coach:read", readOnly: true,
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
        const rows = await studentsSearch(db, teacherId, a.query);
        const exact = rows?.filter((s: {name:string}) => s.name.normalize("NFC").toLocaleLowerCase() ===
          a.query.normalize("NFC").toLocaleLowerCase()) ?? [];
        if (exact.length > 1) return { error: { code: "NEEDS_RESOLUTION",
          message: "Multiple students have this name. Ask for a distinguishing identifier.",
          candidates: exact.map((s: {id:string;name:string}) => ({ id: s.id, name: s.name })),
        } };
        return { data: rows };
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
    if (error instanceof CoachError)
      return { error: { code: error.code, message: error.message } };
    return { error: { code: "DATABASE_ERROR", message: "Operation failed" } };
  }
}
