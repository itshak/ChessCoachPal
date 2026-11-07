import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CoachError, attendanceList, groupsList, groupsMembers,
  sessionsList, sessionsParticipants, studentsSearch, workplacesList,
} from "@/lib/server/coach-service";

import { chessCategoriesList, chessObservationsList, chessObservationsCreate,
  chessResourcesList, chessResourcesCreate } from "@/lib/server/chess-learning";
import { chessUuid, observationInput, resourceInput } from "@/lib/chess-learning";

const uuid = z.string().uuid();
const searchText = z.string().trim().min(1).max(80);
const sessionId = z.object({ sessionId: uuid }).strict();

const catalogue = [
  {
    name: "ccp_v1_workplaces_list",
    description: "List the connected teacher's workplaces. Use workplace IDs, never invent names.",
    schema: z.object({}).strict(), scope: "coach:read", readOnly: true,
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
  name: string, input: unknown, scopes: string[]) {
  const parsed = validateCall(name, input);
  if ("error" in parsed) return { error: parsed.error };
  const { tool, args } = parsed;
  if (!scopes.includes(tool!.scope)) return { error: { code: "FORBIDDEN", message: "Insufficient OAuth scope" } };
  try {
    switch (name) {
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
