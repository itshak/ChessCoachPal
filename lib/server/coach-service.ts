import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One domain surface for browser requests and AI tool adapters.
 * Always use a user-scoped Supabase client; never use the service role here.
 * Database RLS AND composite owner FKs enforce isolation.
 */
export class CoachError extends Error {
  constructor(
    public code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "DATABASE_ERROR",
    public status: number,
    message: string
  ) {
    super(message);
  }
}

type Db = SupabaseClient;
const problem = (message = "Database operation failed") =>
  new CoachError("DATABASE_ERROR", 500, message);
const notFound = () => new CoachError("NOT_FOUND", 404, "Record not found");
const conflict = () => new CoachError("CONFLICT", 409, "Request conflicts with an existing record");

export async function workplacesList(db: Db, teacherId: string) {
  const { data, error } = await db.from("workplaces")
    .select("id,name,timezone,currency,locale,policy").eq("teacher_id", teacherId).order("name").limit(100);
  if (error) throw problem();
  return data;
}

export async function workplacesCreate(
  db: Db, teacherId: string, name: string, timezone: string, currency: string,
  locale = 'en', policy: Record<string, unknown> = {}
) {
  const { data, error } = await db.from("workplaces")
    .insert({ teacher_id: teacherId, name, timezone, currency, locale, policy })
    .select("id,name,timezone,currency,locale,policy").single();
  if (error?.code === "23505") throw conflict();
  if (error) throw problem();
  return data;
}

export async function studentsSearch(db: Db, teacherId: string, search = "") {
  let query = db.from("students")
    .select("id,name,level").eq("teacher_id", teacherId)
    .is("archived_at", null).order("name").limit(100);
  if (search) {
    // Literal prefix search; escape PostgREST LIKE metacharacters.
    const escaped = search.replace(/[\\%_]/g, "\\$&");
    query = query.ilike("name", `%${escaped}%`);
  }
  const { data, error } = await query;
  if (error) throw problem();
  return data;
}

export async function groupsList(db: Db, teacherId: string) {
  const { data, error } = await db.from("class_groups")
    .select("id,name,workplace_id").eq("teacher_id", teacherId).order("name").limit(100);
  if (error) throw problem();
  return data;
}

export async function groupsCreate(db: Db, teacherId: string, workplaceId: string, name: string) {
  const { data: workplace } = await db.from("workplaces")
    .select("id").eq("teacher_id", teacherId).eq("id", workplaceId).maybeSingle();
  if (!workplace) throw notFound();
  const { data, error } = await db.from("class_groups")
    .insert({ teacher_id: teacherId, workplace_id: workplaceId, name })
    .select("id,name,workplace_id").single();
  if (error?.code === "23505") throw conflict();
  if (error) throw problem();
  return data;
}

export async function groupsEnroll(db: Db, teacherId: string, groupId: string, studentId: string) {
  const [{ data: group }, { data: student }] = await Promise.all([
    db.from("class_groups").select("id,workplace_id").eq("id", groupId).eq("teacher_id", teacherId).maybeSingle(),
    db.from("students").select("id").eq("id", studentId).eq("teacher_id", teacherId)
      .is("archived_at", null).maybeSingle(),
  ]);
  if (!group || !student) throw notFound();
  await workplacesEnroll(db, teacherId, group.workplace_id, studentId);
  const { data, error } = await db.from("group_enrollments")
    .upsert({ teacher_id: teacherId, group_id: groupId, workplace_id: group.workplace_id, student_id: studentId }, {
      onConflict: "group_id,student_id",
      ignoreDuplicates: true,
    })
    .select("group_id,student_id").maybeSingle();
  if (error) throw problem();
  return data ?? { group_id: groupId, student_id: studentId };
}

export async function groupsMembers(db: Db, teacherId: string, groupId: string) {
  const { data: group } = await db.from("class_groups")
    .select("id").eq("id", groupId).eq("teacher_id", teacherId).maybeSingle();
  if (!group) throw notFound();
  const { data, error } = await db.from("group_enrollments")
    .select("student_id,students!inner(name)").eq("teacher_id", teacherId)
    .eq("group_id", groupId).order("created_at").limit(100);
  if (error) throw problem();
  return data;
}

export async function sessionsList(db: Db, teacherId: string) {
  const { data, error } = await db.from("teaching_sessions")
    .select("id,title,starts_at,duration_minutes,lesson_note,status,workplace_id,group_id,student_id")
    .eq("teacher_id", teacherId).order("starts_at", { ascending: false }).limit(100);
  if (error) throw problem();
  return data;
}

/** Reject malformed instants and invalid durations before database writes. */
export function assertSessionSchedule(startsAt: string, durationMinutes: number) {
  if (typeof startsAt !== "string" ||
      !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$/.test(startsAt) ||
      !Number.isFinite(Date.parse(startsAt))) {
    throw new CoachError("VALIDATION_ERROR", 400, "Start time must be a valid ISO 8601 instant with an explicit UTC offset");
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    throw new CoachError("VALIDATION_ERROR", 400, "Duration must be an integer between 15 and 480 minutes");
  }
}

export async function sessionsCreate(
  db: Db,
  teacherId: string,
  payload: {
    workplaceId: string; groupId?: string; studentId?: string;
    title: string; startsAt: string; durationMinutes: number;
    lessonNote?: string; requestId: string;
  }
) {
  assertSessionSchedule(payload.startsAt, payload.durationMinutes);
  if (Boolean(payload.groupId) === Boolean(payload.studentId)) {
    throw new CoachError("VALIDATION_ERROR", 400, "Specify exactly one group or student");
  }
  const { data: workplace } = await db.from("workplaces")
    .select("id").eq("id", payload.workplaceId).eq("teacher_id", teacherId).maybeSingle();
  if (!workplace) throw notFound();
  if (payload.groupId) {
    const { data: group } = await db.from("class_groups").select("id")
      .eq("id", payload.groupId).eq("workplace_id", payload.workplaceId)
      .eq("teacher_id", teacherId).maybeSingle();
    if (!group) throw notFound();
  } else {
    const { data: student } = await db.from("students").select("id")
      .eq("id", payload.studentId!).eq("teacher_id", teacherId)
      .is("archived_at", null).maybeSingle();
    if (!student) throw notFound();
    const { data: enrolled } = await db.from("workplace_enrollments")
      .select("id").eq("teacher_id", teacherId)
      .eq("workplace_id", payload.workplaceId).eq("student_id", payload.studentId!)
      .maybeSingle();
    if (!enrolled) throw notFound();
  }
  const values = {
    teacher_id: teacherId, workplace_id: payload.workplaceId,
    group_id: payload.groupId ?? null, student_id: payload.studentId ?? null,
    title: payload.title, starts_at: payload.startsAt,
    duration_minutes: payload.durationMinutes,
    lesson_note: payload.lessonNote ?? "", request_id: payload.requestId,
  };
  const { data, error } = await db.from("teaching_sessions")
    .insert(values)
    .select("id,title,starts_at,duration_minutes,lesson_note,status,workplace_id,group_id,student_id").single();
  if (error?.code === "23505") {
    const { data: previous } = await db.from("teaching_sessions")
      .select("id,title,starts_at,duration_minutes,lesson_note,status,workplace_id,group_id,student_id")
      .eq("teacher_id", teacherId).eq("request_id", payload.requestId).maybeSingle();
    if (!previous) throw conflict();
    const same = previous.workplace_id === values.workplace_id &&
      previous.group_id === values.group_id &&
      previous.student_id === values.student_id &&
      previous.title === values.title &&
      new Date(previous.starts_at).getTime() === new Date(values.starts_at).getTime() &&
      previous.duration_minutes === values.duration_minutes &&
      previous.lesson_note === values.lesson_note;
    if (!same) throw conflict();
    return previous;
  }
  if (error) throw problem();
  return data;
}

export async function sessionsParticipants(db: Db, teacherId: string, sessionId: string) {
  const { data: session } = await db.from("teaching_sessions")
    .select("id").eq("teacher_id", teacherId).eq("id", sessionId).maybeSingle();
  if (!session) throw notFound();
  const { data, error } = await db.from("session_participants")
    .select("student_id,students!inner(name)")
    .eq("teacher_id", teacherId).eq("session_id", sessionId).limit(100);
  if (error) throw problem();
  return data;
}

export async function attendanceList(db: Db, teacherId: string, sessionId: string) {
  const { data: session } = await db.from("teaching_sessions")
    .select("id").eq("teacher_id", teacherId).eq("id", sessionId).maybeSingle();
  if (!session) throw notFound();
  const { data, error } = await db.from("session_attendance")
    .select("student_id,status,note,updated_at").eq("teacher_id", teacherId)
    .eq("session_id", sessionId).limit(100);
  if (error) throw problem();
  return data;
}

export async function attendanceRecord(
  db: Db, teacherId: string,
  payload: { sessionId: string; studentId: string; status: string; note?: string }
) {
  const { data: participant } = await db.from("session_participants")
    .select("student_id").eq("teacher_id", teacherId)
    .eq("session_id", payload.sessionId).eq("student_id", payload.studentId)
    .maybeSingle();
  if (!participant) throw notFound();
  const { data, error } = await db.from("session_attendance")
    .update({
      status: payload.status, note: payload.note ?? "", updated_at: new Date().toISOString(),
    }).eq("teacher_id", teacherId).eq("session_id", payload.sessionId)
    .eq("student_id", payload.studentId)
    .select("student_id,status,note,updated_at").maybeSingle();
  if (error) throw problem();
  if (!data) throw notFound();
  return data;
}

/** Strict IANA validation. The database retains the requested zone, not the server's zone. */
export function assertTimezone(value: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); }
  catch { throw new CoachError("VALIDATION_ERROR", 400, "Invalid IANA timezone"); }
}

/** One session is one block of teacher time, regardless of roster size. */
export function instructorMinutes(
  sessions: Array<{ duration_minutes: number; status?: string }>
): number {
  return sessions.reduce((total, item) =>
    total + (item.status === "cancelled" ? 0 : item.duration_minutes), 0);
}

export async function workplacesUpdate(
  db: Db, teacherId: string, workplaceId: string,
  updates: { name?: string; timezone?: string; currency?: string; locale?: string; policy?: Record<string, unknown> }
) {
  if (updates.timezone) assertTimezone(updates.timezone);
  const { data, error } = await db.from("workplaces").update(updates)
    .eq("teacher_id", teacherId).eq("id", workplaceId)
    .select("id,name,timezone,currency,locale,policy").maybeSingle();
  if (error?.code === "23505") throw conflict();
  if (error) throw problem();
  if (!data) throw notFound();
  return data;
}

export async function studentsCreate(db: Db, teacherId: string, name: string, level?: string | null) {
  const { data, error } = await db.from("students")
    .insert({ teacher_id: teacherId, name, level: level ?? null })
    .select("id,name,level").single();
  if (error) throw problem();
  return data;
}

export async function studentsUpdate(
  db: Db, teacherId: string, studentId: string,
  updates: { name?: string; level?: string | null }
) {
  const { data, error } = await db.from("students").update(updates)
    .eq("teacher_id", teacherId).eq("id", studentId).is("archived_at", null)
    .select("id,name,level").maybeSingle();
  if (error) throw problem();
  if (!data) throw notFound();
  return data;
}

export async function workplacesEnroll(
  db: Db, teacherId: string, workplaceId: string, studentId: string
) {
  const [{ data: workplace }, { data: student }] = await Promise.all([
    db.from("workplaces").select("id").eq("id", workplaceId)
      .eq("teacher_id", teacherId).maybeSingle(),
    db.from("students").select("id").eq("id", studentId)
      .eq("teacher_id", teacherId).is("archived_at", null).maybeSingle(),
  ]);
  if (!workplace || !student) throw notFound();
  const { data, error } = await db.from("workplace_enrollments")
    .upsert({ teacher_id: teacherId, workplace_id: workplaceId, student_id: studentId }, {
      onConflict: "teacher_id,workplace_id,student_id", ignoreDuplicates: true,
    }).select("workplace_id,student_id").maybeSingle();
  if (error) throw problem();
  return data ?? { workplace_id: workplaceId, student_id: studentId };
}

export async function workplacesEnrollments(db: Db, teacherId: string, workplaceId: string) {
  const { data: workplace } = await db.from("workplaces")
    .select("id").eq("id", workplaceId).eq("teacher_id", teacherId).maybeSingle();
  if (!workplace) throw notFound();
  const { data, error } = await db.from("workplace_enrollments")
    .select("student_id").eq("teacher_id", teacherId).eq("workplace_id", workplaceId);
  if (error) throw problem();
  return data;
}

export async function groupsUpdate(
  db: Db, teacherId: string, groupId: string, workplaceId: string, name: string
) {
  const { data, error } = await db.from("class_groups").update({ name })
    .eq("id", groupId).eq("teacher_id", teacherId).eq("workplace_id", workplaceId)
    .select("id,name,workplace_id").maybeSingle();
  if (error?.code === "23505") throw conflict();
  if (error) throw problem();
  if (!data) throw notFound();
  return data;
}

export async function sessionsUpdate(
  db: Db, teacherId: string, sessionId: string,
  updates: {
    title?: string; startsAt?: string; durationMinutes?: number;
    lessonNote?: string; status?: "scheduled" | "completed" | "cancelled";
  }
) {
  if (updates.startsAt !== undefined || updates.durationMinutes !== undefined) {
    if (updates.startsAt !== undefined && (typeof updates.startsAt !== "string" || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$/.test(updates.startsAt) || !Number.isFinite(Date.parse(updates.startsAt)))) {
      throw new CoachError("VALIDATION_ERROR", 400, "Start time must be a valid ISO 8601 instant with an explicit UTC offset");
    }
    if (updates.durationMinutes !== undefined && (!Number.isInteger(updates.durationMinutes) || updates.durationMinutes < 1 || updates.durationMinutes > 1440)) {
      throw new CoachError("VALIDATION_ERROR", 400, "Duration must be an integer between 15 and 480 minutes");
    }
  }
  const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) changes.title = updates.title;
  if (updates.startsAt !== undefined) changes.starts_at = updates.startsAt;
  if (updates.durationMinutes !== undefined) changes.duration_minutes = updates.durationMinutes;
  if (updates.lessonNote !== undefined) changes.lesson_note = updates.lessonNote;
  if (updates.status !== undefined) changes.status = updates.status;
  const { data, error } = await db.from("teaching_sessions").update(changes)
    .eq("teacher_id", teacherId).eq("id", sessionId)
    .select("id,title,starts_at,duration_minutes,lesson_note,status,workplace_id,group_id,student_id")
    .maybeSingle();
  if (error) throw problem();
  if (!data) throw notFound();
  return data;
}
