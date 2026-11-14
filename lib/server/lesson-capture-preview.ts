import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSessionSchedule } from "@/lib/server/coach-service";

/**
 * This is a read-only, deterministic capture PREVIEW, not an AI guess or a
 * scheduling write. The user must still confirm the stable IDs and exact time
 * before invoking the existing idempotent sessions.createAdHoc operation.
 */
const uuid = z.string().uuid();
export const lessonCapturePreviewSchema = z.object({
  names: z.array(z.string().trim().min(1).max(120)).min(2).max(50),
  workplaceId: uuid.optional(),
  title: z.string().trim().min(1).max(160),
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(480),
  lessonNote: z.string().max(10000).default(""),
}).strict();

export type LessonCapturePreviewInput = z.infer<typeof lessonCapturePreviewSchema>;

export class LessonCapturePreviewError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// Unicode normalization is only for exact teacher-owned identity matches;
// never use fuzzy/substring guessing, translation or automatic transliteration.
export function normalizeStudentIdentity(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

type StudentIdentity = { id: string; name: string; name_aliases: string[] | null };
type Workplace = { id: string; name: string; timezone: string };
type ResolutionIssue = {
  code: "NOT_FOUND" | "AMBIGUOUS_STUDENT" | "DUPLICATE_STUDENT" |
    "NO_COMMON_WORKPLACE" | "AMBIGUOUS_WORKPLACE" | "WORKPLACE_NOT_FOUND" |
    "STUDENT_NOT_ENROLLED";
  message: string;
  input?: string;
  candidates?: Array<{ id: string; name: string }>;
};

const fail = (code: string, message: string) =>
  new LessonCapturePreviewError(503, code, message);

async function activeStudents(db: SupabaseClient, teacherId: string) {
  const rows: StudentIdentity[] = [];
  const batch = 250;
  // Self-hosted teachers may have more than 1,000 historical students.
  // A truncated roster is unsafe: a duplicate alias after the first page
  // must not silently turn an ambiguous identity into an exact match.
  for (let offset = 0; offset < 20000; offset += batch) {
    const { data, error } = await db.from("students")
      .select("id,name,name_aliases")
      .eq("teacher_id", teacherId).is("archived_at", null)
      .order("id").range(offset, offset + batch - 1);
    if (error || !data) throw fail("ROSTER_UNAVAILABLE", "Student identity lookup unavailable");
    rows.push(...data as StudentIdentity[]);
    if (data.length < batch) return rows;
  }
  throw fail("ROSTER_LIMIT", "Too many students for safe unambiguous name resolution");
}

/** Match only active learners within this teacher, then find their common workplace. */
export async function teacherLessonCapturePreview(
  db: SupabaseClient, teacherId: string, input: LessonCapturePreviewInput,
) {
  assertSessionSchedule(input.startsAt, input.durationMinutes);
  const students = await activeStudents(db, teacherId);
  const lookup = new Map<string, StudentIdentity[]>();
  for (const student of students) {
    const variants = [student.name, ...(Array.isArray(student.name_aliases) ? student.name_aliases : [])];
    for (const key of new Set(variants.map(normalizeStudentIdentity).filter(Boolean))) {
      const matches = lookup.get(key) ?? [];
      matches.push(student);
      lookup.set(key, matches);
    }
  }

  const issues: ResolutionIssue[] = [];
  const resolutions = input.names.map(name => {
    const matches = lookup.get(normalizeStudentIdentity(name)) ?? [];
    if (matches.length === 0) {
      issues.push({ code: "NOT_FOUND", input: name,
        message: "No active student has this exact name or alias" });
    } else if (matches.length > 1) {
      issues.push({ code: "AMBIGUOUS_STUDENT", input: name,
        message: "Multiple students share this name or alias; choose the stable student ID",
        candidates: matches.map(s => ({ id: s.id, name: s.name })) });
    }
    return { input: name, status: matches.length === 1 ? "resolved" as const :
      matches.length === 0 ? "not_found" as const : "ambiguous" as const,
      studentId: matches.length === 1 ? matches[0].id : null,
      name: matches.length === 1 ? matches[0].name : null,
      candidates: matches.length > 1 ? matches.map(s => ({ id: s.id, name: s.name })) : [] };
  });

  const ids = resolutions.map(r => r.studentId).filter((id): id is string => id !== null);
  if (new Set(ids).size !== ids.length) {
    issues.push({ code: "DUPLICATE_STUDENT",
      message: "The same learner appears more than once in the proposed roster" });
  }

  let selectedWorkplace: Workplace | null = null;
  const enrolledByStudent = new Map<string, Set<string>>();
  if (ids.length > 0) {
    // PostgREST installations commonly cap responses at 1,000 rows even when
    // the requested range is larger. Page deterministically: a truncated
    // enrollment query could falsely exclude a valid second workplace.
    const batch = 250;
    let exhausted = false;
    for (let offset = 0; offset < 20000; offset += batch) {
      const { data, error } = await db.from("workplace_enrollments")
        .select("student_id,workplace_id")
        .eq("teacher_id", teacherId).in("student_id", [...new Set(ids)])
        .order("student_id").order("workplace_id")
        .range(offset, offset + batch - 1);
      if (error || !data)
        throw fail("ENROLLMENTS_UNAVAILABLE", "Cannot verify workplace enrollment safely");
      for (const row of data) {
        const values = enrolledByStudent.get(row.student_id) ?? new Set<string>();
        values.add(row.workplace_id);
        enrolledByStudent.set(row.student_id, values);
      }
      if (data.length < batch) { exhausted = true; break; }
    }
    if (!exhausted)
      throw fail("ENROLLMENTS_LIMIT", "Too many enrollments for an unambiguous preview");
  }

  if (input.workplaceId) {
    const { data, error } = await db.from("workplaces")
      .select("id,name,timezone")
      .eq("teacher_id", teacherId).eq("id", input.workplaceId).maybeSingle();
    if (error) throw fail("WORKPLACE_UNAVAILABLE", "Workplace lookup unavailable");
    if (!data) {
      issues.push({ code: "WORKPLACE_NOT_FOUND", message: "Specified workplace is unavailable" });
    } else {
      selectedWorkplace = data as Workplace;
      for (const r of resolutions) {
        if (r.studentId && !enrolledByStudent.get(r.studentId)?.has(data.id)) {
          issues.push({ code: "STUDENT_NOT_ENROLLED", input: r.input,
            message: "Student is not currently enrolled in the requested workplace" });
        }
      }
    }
  } else if (ids.length > 0 && ids.length === input.names.length &&
    new Set(ids).size === ids.length) {
    const common = [...(enrolledByStudent.get(ids[0]) ?? new Set<string>())]
      .filter(id => ids.every(studentId => enrolledByStudent.get(studentId)?.has(id)));
    if (common.length === 0) {
      issues.push({ code: "NO_COMMON_WORKPLACE",
        message: "No workplace contains every selected student; specify and review enrollments" });
    } else {
      const { data, error } = await db.from("workplaces")
        .select("id,name,timezone").eq("teacher_id", teacherId).in("id", common)
        .order("id").limit(100);
      if (error || !data || data.length !== common.length)
        throw fail("WORKPLACE_UNAVAILABLE", "Cannot verify common workplaces safely");
      if (data.length === 1) selectedWorkplace = data[0] as Workplace;
      else issues.push({ code: "AMBIGUOUS_WORKPLACE",
        message: "More than one workplace contains these students; choose one explicitly",
        candidates: data.map(w => ({ id: w.id, name: w.name })) });
    }
  }

  const canCommit = issues.length === 0 && selectedWorkplace !== null;
  return {
    canCommit,
    resolutions,
    issues,
    workplace: selectedWorkplace,
    proposedSession: canCommit ? {
      workplaceId: selectedWorkplace!.id, studentIds: ids,
      title: input.title, startsAt: input.startsAt,
      durationMinutes: input.durationMinutes, lessonNote: input.lessonNote,
    } : null,
    review: {
      creates: "One scheduled lesson with a frozen roster and unmarked attendance",
      instructorMinutes: input.durationMinutes,
      studentCount: ids.length,
      attendance: "unmarked",
      inferredComprehension: false,
      writesPerformed: false,
      nextStep: "After teacher approval, use ccp_v1_sessions_ad_hoc_create with the exact preview IDs, a new idempotencyKey and confirmed=true. Record attendance/completion separately.",
    },
  };
}
