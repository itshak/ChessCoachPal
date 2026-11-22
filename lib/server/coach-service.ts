import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One domain surface for browser requests and AI tool adapters.
 * Always use a user-scoped Supabase client; never use the service role here.
 * Database RLS AND composite owner FKs enforce isolation.
 */
export class CoachError extends Error {
  constructor(
    public code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "DATABASE_ERROR" | "TOO_MANY_WORKPLACES" |
      "ARCHIVED_STUDENT_CONFIRMATION_REQUIRED",
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
  // This shared website/MCP list must include a coach's current selection.
  // A 100-row cap silently hid recently created workplaces (and broke all
  // reporting/lesson selectors) after a realistic long-lived teacher history.
  const { data, error } = await db.from("workplaces")
    .select("id,name,timezone,currency,locale,policy,updated_at,cancellation_window_hours")
    .eq("teacher_id", teacherId).order("name").order("id").limit(1000);
  if (error) throw problem();
  if ((data?.length ?? 0) >= 1000)
    throw new CoachError("VALIDATION_ERROR",413,"Workplace inventory exceeds the supported list limit");
  return data;
}

export async function workplacesCreate(
  db: Db, teacherId: string, name: string, timezone: string, currency: string,
  locale = 'en', policy: Record<string, unknown> = {}, cancellationWindowHours:number|null=null
) {
  const { data, error } = await db.from("workplaces")
    .insert({ teacher_id: teacherId, name, timezone, currency, locale, policy, cancellation_window_hours:cancellationWindowHours })
    .select("id,name,timezone,currency,locale,policy,cancellation_window_hours").single();
  if (error?.code === "23505") throw conflict();
  if (error) throw problem();
  return data;
}

export async function studentsSearch(db: Db, teacherId: string, search = "") {
  let query = db.from("students")
    .select("id,name,level,updated_at").eq("teacher_id", teacherId)
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
    .select("id,name,workplace_id,updated_at").eq("teacher_id", teacherId).order("name").limit(100);
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

/** Remove a current group enrollment without rewriting historical session snapshots. */
export async function groupsUnenroll(db: Db, teacherId: string, groupId: string, studentId: string) {
  const { data: group, error: groupError } = await db.from("class_groups")
    .select("id").eq("teacher_id", teacherId).eq("id", groupId).maybeSingle();
  if (groupError) throw problem();
  if (!group) throw notFound();
  const { data, error } = await db.from("group_enrollments").delete()
    .eq("teacher_id", teacherId).eq("group_id", groupId).eq("student_id", studentId)
    .select("group_id,student_id").maybeSingle();
  if (error) throw problem();
  if (!data) throw notFound();
  return data;
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

export async function sessionsList(db: Db, teacherId: string, workplaceId?:string|null) {
  if(workplaceId){
    const owned=await db.from("workplaces").select("id").eq("teacher_id",teacherId).eq("id",workplaceId).maybeSingle();
    if(owned.error)throw problem();
    if(!owned.data)throw notFound();
  }
  let query=db.from("teaching_sessions")
    .select("id,title,starts_at,duration_minutes,lesson_note,status,workplace_id,group_id,student_id")
    .eq("teacher_id", teacherId)
    .order("starts_at", { ascending: false })
    .order("id", { ascending: true }).limit(100);
  if(workplaceId)query=query.eq("workplace_id",workplaceId);
  const {data,error}=await query;
  if (error) throw problem();
  return data;
}

/** Reject malformed instants and invalid durations before database writes. */
export function assertSessionSchedule(startsAt: string, durationMinutes: number) {
  if (typeof startsAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(startsAt) ||
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
    const { data: student } = await db.from("students").select("id,archived_at")
      .eq("id", payload.studentId!).eq("teacher_id", teacherId).maybeSingle();
    if (!student) throw notFound();
    if (student.archived_at !== null) throw new CoachError(
      "ARCHIVED_STUDENT_CONFIRMATION_REQUIRED",409,
      "This student is archived; review and explicitly approve reactivation and the lesson before writing");
    const { data: enrolled } = await db.from("workplace_enrollments")
      .select("id").eq("teacher_id", teacherId)
      .eq("workplace_id", payload.workplaceId).eq("student_id", payload.studentId!)
      .is("cancelled_at",null).limit(1).maybeSingle();
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
  // The DB schedule guard runs before the unique request-id constraint, so
  // a valid retry can surface as exclusion conflict (23P01), not just 23505.
  // Compare the persisted request before deciding whether this is a replay.
  if (error?.code === "23505" || error?.code === "23P01") {
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


/** Atomically create a one-off lesson for 2–50 distinct workplace students.
 * The owner-scoped RPC freezes the approved participants, attendance and
 * session in the same transaction, and provides request-UUID replay safety.
 */
export async function sessionsAdHocCreate(db:Db,teacherId:string,payload:{
  workplaceId:string;studentIds:string[];title:string;startsAt:string;
  durationMinutes:number;lessonNote?:string;requestId:string;
}){
  assertSessionSchedule(payload.startsAt,payload.durationMinutes);
  if(payload.studentIds.length<2||payload.studentIds.length>50||
    new Set(payload.studentIds).size!==payload.studentIds.length)
    throw new CoachError("VALIDATION_ERROR",400,"Choose 2–50 distinct students");
  // Give an actionable owner-scoped lifecycle error for direct-ID MCP calls.
  // This is advisory only; the RPC remains the authoritative concurrency guard.
  const {data:ownedStudents,error:lookupError}=await db.from("students")
    .select("id,archived_at").eq("teacher_id",teacherId)
    .in("id",payload.studentIds);
  if(lookupError)throw problem();
  if(ownedStudents?.some(student=>student.archived_at!==null))
    throw new CoachError("ARCHIVED_STUDENT_CONFIRMATION_REQUIRED",409,
      "One or more selected students are archived; review the exact identities and approve a combined reactivation and lesson");
  const {data,error}=await db.rpc("ccp_teacher_ad_hoc_session_create",{
    p_workplace_id:payload.workplaceId,p_student_ids:payload.studentIds,
    p_title:payload.title,p_starts_at:payload.startsAt,
    p_duration_minutes:payload.durationMinutes,
    p_lesson_note:payload.lessonNote??"",p_request_id:payload.requestId,
  });
  if(error){
    if(/CONFLICT|23P01|23505/.test(error.message))
      throw new CoachError("CONFLICT",409,"Session conflicts with an existing lesson or changed replay");
    if(/NOT_FOUND|42501/.test(error.message))
      throw new CoachError("NOT_FOUND",404,"Workplace or student enrollment not found");
    if(/INVALID|DUPLICATE|22023/.test(error.message))
      throw new CoachError("VALIDATION_ERROR",400,"Invalid ad-hoc session");
    throw problem();
  }
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
  const [{data:roster,error:rosterError},{data:decisions,error:decisionError}]=await Promise.all([
    db.from("session_participants").select("student_id")
      .eq("teacher_id",teacherId).eq("session_id",sessionId).limit(100),
    db.from("session_attendance")
      .select("student_id,status,note,notice_at,cancelled_by,cancel_reason,marked_at,marked_by,updated_at")
      .eq("teacher_id",teacherId).eq("session_id",sessionId).limit(100),
  ]);
  if(rosterError||decisionError)throw problem();
  const indexed=new Map((decisions??[]).map(row=>[row.student_id,row]));
  return (roster??[]).map(member=>indexed.get(member.student_id)??{
    student_id:member.student_id,status:"unmarked",note:"",
    notice_at:null,cancelled_by:null,cancel_reason:"",
    marked_at:null,marked_by:null,updated_at:null,
  });
}

/** One current coaching attendance writer for website and delegated MCP.
 * The SQL transaction owns authorization, frozen-roster membership, revision,
 * request receipts and rollback. No web-only direct UPDATE survives.
 */
export async function attendanceRecord(
  db: Db, teacherId: string,
  payload:{sessionId:string;studentId:string;status:string;note?:string;
    noticeAt?:string;cancelReason?:string;
    expectedUpdatedAt?:string|null;requestId?:string}
) {
 const cancelled=["student_cancelled","teacher_cancelled"].includes(payload.status);
 if(!["present","absent","late","excused","student_cancelled","teacher_cancelled"].includes(payload.status)||
    (payload.note??"").length>5000||
    (payload.cancelReason??"").length>1000||
    (payload.status==="student_cancelled"&&!payload.noticeAt)||
    (!cancelled&&(payload.noticeAt!==undefined||payload.cancelReason!==undefined))||
    (payload.noticeAt!==undefined&&
       (!/^(?:\d{4}-\d{2}-\d{2}T)/.test(payload.noticeAt)||!Number.isFinite(Date.parse(payload.noticeAt)))))
   throw new CoachError("VALIDATION_ERROR",400,"Invalid attendance status or cancellation evidence");
 if((payload.requestId===undefined)!==(payload.expectedUpdatedAt===undefined))
   throw new CoachError("VALIDATION_ERROR",400,
    "Provide both the revision (null if unmarked) and idempotency key");
 let expected=payload.expectedUpdatedAt;
 if(expected===undefined){
   const {data,error}=await db.from("session_attendance")
    .select("updated_at").eq("teacher_id",teacherId)
    .eq("session_id",payload.sessionId).eq("student_id",payload.studentId).maybeSingle();
   if(error)throw problem();
   expected=data?.updated_at??null;
 }
 const requestId=payload.requestId??crypto.randomUUID();
 const {data:receipt,error}=await db.rpc("ccp_teacher_session_commit",{
   p_session_id:payload.sessionId,p_changes:{},
   p_attendance:[{
     studentId:payload.studentId,status:payload.status,
     note:payload.note??"",expectedUpdatedAt:expected,
     ...(payload.noticeAt!==undefined?{noticeAt:payload.noticeAt}:{}),
     ...(payload.cancelReason!==undefined?{cancelReason:payload.cancelReason}:{}),
   }],
   p_expected_updated_at:null,p_idempotency_key:requestId,
 });
 if(error){
   if(error.code==="23505"||/CONFLICT|REVISION/.test(error.message))
     throw conflict();
   if(error.code==="42501"||/NOT_FOUND/.test(error.message))
     throw notFound();
   if(error.code==="22023")throw new CoachError("VALIDATION_ERROR",400,
     "Invalid attendance correction");
   throw problem();
 }
 // MCP callers receive the immutable SQL receipt for replay; website callers
 // retain the ordinary row shape used by the teaching workspace.
 if(payload.requestId)return receipt;
 const {data,error:readError}=await db.from("session_attendance")
   .select("student_id,status,note,notice_at,cancelled_by,cancel_reason,marked_at,marked_by,updated_at").eq("teacher_id",teacherId)
   .eq("session_id",payload.sessionId).eq("student_id",payload.studentId).maybeSingle();
 if(readError)throw problem();
 if(!data)throw notFound();
 return data;
}

/** Website and delegated MCP bulk marks use the SAME atomic SQL transaction
 * as a single attendance correction and confirmed session completion.
 */
export async function attendanceBulkRecord(
 db:Db,teacherId:string,input:import("@/lib/lesson-completion").AttendanceBulkRecordInput
){
 void teacherId; // RLS/Auth identity is resolved by the SQL RPC itself.
 const {data,error}=await db.rpc("ccp_teacher_session_commit",{
  p_session_id:input.sessionId,p_changes:{},p_attendance:input.attendance,
  p_expected_updated_at:null,p_idempotency_key:input.idempotencyKey,
 });
 if(error){
  if(error.code==="23505"||/CONFLICT|REVISION/.test(error.message))
   throw conflict();
  if(error.code==="42501"||/NOT_FOUND/.test(error.message))
   throw notFound();
  if(error.code==="22023")throw new CoachError("VALIDATION_ERROR",400,
   "Invalid or duplicate frozen participant attendance");
  throw problem();
 }
 return data;
}

export async function sessionsComplete(
  db:Db,teacherId:string,input:import("@/lib/lesson-completion").LessonCompletionInput
){
 void teacherId; // Authoritative transaction uses auth.uid() for all rows.
 if(input.attendance.length<1||input.attendance.length>50)
   throw new CoachError("VALIDATION_ERROR",400,"Complete the frozen roster for this session");
 const {data,error}=await db.rpc("ccp_teacher_session_commit",{
   p_session_id:input.sessionId,
   p_changes:{status:"completed",...(input.lessonNote!==undefined?{lessonNote:input.lessonNote}:{})},
   p_attendance:input.attendance,
   p_expected_updated_at:input.expectedUpdatedAt,
   p_idempotency_key:input.idempotencyKey,
 });
 if(error){
   if(error.code==="23505"||/CONFLICT|REVISION/.test(error.message))
     throw conflict();
   if(error.code==="42501"||/NOT_FOUND/.test(error.message))
     throw notFound();
   if(error.code==="22023"||/INCOMPLETE_SESSION_ROSTER/.test(error.message))
     throw new CoachError("VALIDATION_ERROR",400,
       "Every frozen participant needs one explicit status and current revision");
   throw problem();
 }
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

export async function studentsCreate(db: Db, teacherId: string, name: string, level?: string | null) {
  const { data, error } = await db.from("students")
    .insert({ teacher_id: teacherId, name, level: level ?? null })
    .select("id,name,level").single();
  if (error) throw problem();
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
  // Memberships are dated intervals, not a unique (teacher, workplace,
  // student) row. An upsert targeting that retired unique constraint fails
  // with PostgreSQL 42P10 and breaks both website and MCP parity.
  const today = await teacherToday(db,teacherId);
  const current = () => db.from("workplace_enrollments")
    .select("id,workplace_id,student_id")
    .eq("teacher_id", teacherId).eq("workplace_id", workplaceId)
    .eq("student_id", studentId).is("cancelled_at", null)
    .or(`starts_on.is.null,starts_on.lte.${today}`)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .maybeSingle();
  const { data: already, error: readError } = await current();
  if (readError) throw problem();
  if (already) return { workplace_id: workplaceId, student_id: studentId };

  // The SQL BEFORE INSERT trigger sets the exact teacher-local start date.
  // A GiST exclusion constraint protects concurrent overlapping writes.
  const { data, error } = await db.from("workplace_enrollments")
    .insert({ teacher_id: teacherId, workplace_id: workplaceId,
      student_id: studentId, source: "manual" })
    .select("workplace_id,student_id").single();
  if (error?.code === "23P01") {
    const { data: raced, error: raceError } = await current();
    if (raceError) throw problem();
    if (raced) return { workplace_id: workplaceId, student_id: studentId };
    throw new CoachError("CONFLICT", 409,
      "Membership dates overlap an existing or future enrollment period");
  }
  if (error) throw problem();
  return data;
}


/** Teacher calendar dates are never derived from the UTC server date. */
async function teacherToday(db: Db, teacherId: string) {
  const { data: settings, error } = await db.from("teacher_settings")
    .select("timezone").eq("teacher_id", teacherId).maybeSingle();
  if (error) throw problem();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: settings?.timezone ?? "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (key: string) => parts.find(item => item.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function workplacesUnenrollPreview(
  db: Db, teacherId: string, workplaceId: string, studentId: string
) {
  void teacherId; // SQL uses auth.uid(), not a client-supplied tenant identity.
  const { data, error } = await db.rpc("ccp_workplace_enrollment_end_preview", {
    p_workplace_id: workplaceId, p_student_id: studentId,
  });
  if (error?.code === "42501") throw notFound();
  if (error) throw problem();
  return data as {
    membershipId: string; workplaceId: string; studentId: string;
    revision: number; startsOn: string | null; endOn: string;
    activeGroups: number; futureSessions: number; activeSlots: number;
    canEnd: boolean; creditPolicy: string;
  };
}

/** End the current interval without deleting the membership or lesson history.
 * A transactional SQL commit rechecks all future obligations under row locks.
 * Finance is deliberately untouched: unused credits stay held.
 */
export async function workplacesUnenroll(
  db: Db, teacherId: string, workplaceId: string, studentId: string,
  options: {expectedRevision?:number;idempotencyKey?:string;reason?:string} = {}
) {
  const revision = options.expectedRevision ??
    (await workplacesUnenrollPreview(db,teacherId,workplaceId,studentId)).revision;
  const {data,error}=await db.rpc("ccp_workplace_enrollment_end_commit", {
    p_workplace_id:workplaceId,p_student_id:studentId,
    p_expected_revision:revision,
    p_request_id:options.idempotencyKey??crypto.randomUUID(),
    p_reason:options.reason??"Teacher explicitly confirmed end of workplace membership",
    p_confirmed:true,
  });
  if (error?.code==="23503"||error?.code==="23505")
    throw new CoachError("CONFLICT",409,
      "Active groups, future lessons or slots must be resolved, or membership revision changed");
  if (error?.code==="42501") throw notFound();
  if (error?.code==="22023") throw new CoachError("VALIDATION_ERROR",400,
    "Confirmed workplace end request is invalid");
  if (error) throw problem();
  return {workplace_id:workplaceId,student_id:studentId,
    removed:true, ...data};
}

export async function workplacesEnrollments(db: Db, teacherId: string, workplaceId: string) {
  const { data: workplace } = await db.from("workplaces")
    .select("id").eq("id", workplaceId).eq("teacher_id", teacherId).maybeSingle();
  if (!workplace) throw notFound();
  const today = await teacherToday(db,teacherId);
  const { data, error } = await db.from("workplace_enrollments")
    .select("student_id").eq("teacher_id", teacherId).eq("workplace_id", workplaceId)
    .is("cancelled_at",null)
    .or(`starts_on.is.null,starts_on.lte.${today}`)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .order("student_id");
  if (error) throw problem();
  return data;
}

export async function sessionsUpdate(
  db: Db, teacherId: string, sessionId: string,
  updates: {
    title?: string; startsAt?: string; durationMinutes?: number;
    isHomeVisit?: boolean; lessonNote?: string; status?: "scheduled" | "completed" | "cancelled";
    expectedUpdatedAt?: string; requestId?: string;
  }
) {
  if (updates.startsAt !== undefined || updates.durationMinutes !== undefined) {
    if (updates.startsAt !== undefined && (typeof updates.startsAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(updates.startsAt) || !Number.isFinite(Date.parse(updates.startsAt)))) {
      throw new CoachError("VALIDATION_ERROR", 400, "Start time must be a valid ISO 8601 instant with an explicit UTC offset");
    }
    if (updates.durationMinutes !== undefined && (!Number.isInteger(updates.durationMinutes) || updates.durationMinutes < 15 || updates.durationMinutes > 480)) {
      throw new CoachError("VALIDATION_ERROR", 400, "Duration must be an integer between 15 and 480 minutes");
    }
  }
  if(updates.status==="completed")
    throw new CoachError("VALIDATION_ERROR",400,
      "Complete this lesson with explicit attendance for its entire frozen roster");
  const changes: Record<string,unknown> = {};
  if (updates.title !== undefined) changes.title = updates.title;
  if (updates.startsAt !== undefined) changes.startsAt = updates.startsAt;
  if (updates.durationMinutes !== undefined) changes.durationMinutes = updates.durationMinutes;
  if (updates.isHomeVisit !== undefined) changes.isHomeVisit = updates.isHomeVisit;
  if (updates.lessonNote !== undefined) changes.lessonNote = updates.lessonNote;
  if (updates.status !== undefined) changes.status = updates.status;
  if (!Object.keys(changes).length)
    throw new CoachError("VALIDATION_ERROR",400,"At least one session change is required");
  const {data: existing,error: lookupError}=await db.from("teaching_sessions")
    .select("id,updated_at").eq("teacher_id",teacherId).eq("id",sessionId).maybeSingle();
  if (lookupError) throw problem();
  if (!existing) throw notFound();
  // Ordinary website edits observe a fresh revision and new request key.
  // MCP always supplies both; either transport goes through the SAME SQL transaction.
  const {error}=await db.rpc("ccp_teacher_session_commit",{
    p_session_id:sessionId,p_changes:changes,p_attendance:[],
    p_expected_updated_at:updates.expectedUpdatedAt ?? existing.updated_at,
    p_idempotency_key:updates.requestId ?? crypto.randomUUID(),
  });
  if (error?.message.includes("SESSION_SCHEDULE_HISTORY_CONFLICT")) {
    throw new CoachError("CONFLICT",409,
      "This change would rewrite closed or recorded lesson history. Use the attendance or note correction workflow instead.");
  }
  if (error?.code==="23P01" || error?.code==="23505" ||
      /SESSION_REPLAY_CONFLICT|SESSION_REVISION_CONFLICT/.test(error?.message??""))
    throw conflict();
  if (error?.code==="22023") throw new CoachError("VALIDATION_ERROR",400,
    "Invalid session correction");
  if (error) throw problem();
  const {data, error: readError}=await db.from("teaching_sessions")
    .select("id,title,starts_at,duration_minutes,is_home_visit,lesson_note,status,workplace_id,group_id,student_id,updated_at")
    .eq("teacher_id",teacherId).eq("id",sessionId).maybeSingle();
  if (readError) throw problem();
  if (!data) throw notFound();
  return data;
}
