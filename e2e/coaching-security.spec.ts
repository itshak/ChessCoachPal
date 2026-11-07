import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SEED_TEACHER } from "./helpers/auth";

test("teacher isolation, scoped IDs, roster snapshots and idempotent session retries", async ({ request }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !anon || !service) throw new Error("Local Supabase env is required for real RLS acceptance");
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const loginA = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { session: aSession }, error: signInError } = await loginA.auth.signInWithPassword(SEED_TEACHER);
  if (signInError || !aSession) throw signInError ?? new Error("No teacher A session");

  const suffix = Date.now().toString(36);
  const email = `e2e-teacher-b-${suffix}@example.com`;
  const password = "SyntheticPassword-123!";
  const { data: userData, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createError || !userData.user) throw createError ?? new Error("Teacher B user missing");
  const teacherBId = userData.user.id;
  const { error: teacherError } = await admin.from("teachers").insert({
    id: teacherBId, email, display_name: "Synthetic Teacher B",
  });
  if (teacherError) throw teacherError;
  const loginB = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { session: bSession }, error: bError } = await loginB.auth.signInWithPassword({ email, password });
  if (bError || !bSession) throw bError ?? new Error("No teacher B session");

  const post = async (token: string, payload: Record<string, unknown>) => {
    const response = await request.post("/api/agent/v1", {
      data: payload, headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    return { status: response.status(), body };
  };
  const a = aSession.access_token, b = bSession.access_token;
  async function asA(payload: Record<string, unknown>) {
    const result = await post(a, payload);
    expect(result.status, JSON.stringify(result.body)).toBeLessThan(300);
    return result.body.data;
  }

  const wA = await asA({ action: "workplaces.create", name: `Secret workplace ${suffix}`, timezone: "UTC", currency: "USD" });
  const wOther = await asA({ action: "workplaces.create", name: `Other workplace ${suffix}`, timezone: "UTC", currency: "USD" });
  const stu1 = await asA({ action: "students.create", name: `Synthetic Alpha ${suffix}` });
  const stu2 = await asA({ action: "students.create", name: `Synthetic Beta ${suffix}` });
  const stu3 = await asA({ action: "students.create", name: `Synthetic Gamma ${suffix}` });
  const stu4 = await asA({ action: "students.create", name: `Synthetic Delta ${suffix}` });
  const grp = await asA({ action: "groups.create", name: `Synthetic group ${suffix}`, workplaceId: wA.id });
  await asA({ action: "groups.enroll", groupId: grp.id, studentId: stu1.id });
  await asA({ action: "groups.enroll", groupId: grp.id, studentId: stu3.id });
  await asA({ action: "groups.enroll", groupId: grp.id, studentId: stu4.id });

  const payload = {
    action: "sessions.create", workplaceId: wA.id, groupId: grp.id,
    title: `Confidential note ${suffix}`, startsAt: "2027-04-01T14:00:00.000Z",
    durationMinutes: 60, lessonNote: `Private teaching detail ${suffix}`,
    requestId: crypto.randomUUID(),
  };
  const first = await asA(payload);
  const replay = await asA(payload);
  expect(first.id).toBe(replay.id);
  expect((await post(a, { ...payload, title: "Different lesson" })).status).toBe(409);
  expect((await post(a, { ...payload, requestId: crypto.randomUUID(), workplaceId: wOther.id })).status).toBe(404);
  const initialRoster = await asA({ action: "sessions.participants", sessionId: first.id });
  expect(initialRoster.map((row: { student_id: string }) => row.student_id).sort())
    .toEqual([stu1.id, stu3.id, stu4.id].sort());
  const initialAttendance = await asA({ action: "attendance.list", sessionId: first.id });
  expect(initialAttendance).toHaveLength(3);
  expect(initialAttendance.every((a: { status: string }) => a.status === "unmarked")).toBe(true);
  await asA({ action: "groups.enroll", groupId: grp.id, studentId: stu2.id });
  const historicalRoster = await asA({ action: "sessions.participants", sessionId: first.id });
  expect(historicalRoster).toHaveLength(3);
  expect((await post(a, { action: "attendance.record", sessionId: first.id, studentId: stu2.id, status: "present" })).status).toBe(404);
  await asA({ action: "attendance.record", sessionId: first.id, studentId: stu1.id, status: "absent", note: "One absence" });
  const register = await asA({ action: "attendance.list", sessionId: first.id });
  expect(register).toHaveLength(3);
  expect(register.find((entry: { student_id: string }) => entry.student_id === stu1.id).status).toBe("absent");
  expect((await asA({ action: "sessions.list" })).find((s: { id: string }) => s.id === first.id).duration_minutes).toBe(60);

  const forbidden = await post(b, { action: "sessions.participants", sessionId: first.id });
  expect(forbidden.status).toBe(404);
  expect(JSON.stringify(forbidden.body)).not.toContain(suffix);
  expect((await post(b, { action: "sessions.update", sessionId: first.id, lessonNote: "Tampered" })).status).toBe(404);
  expect((await post(b, { action: "groups.enroll", groupId: grp.id, studentId: stu1.id })).status).toBe(404);
  const dbB = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${b}` } },
  });
  const { data: foreignWorkplaces } = await dbB.from("workplaces").select("id").eq("id", wA.id);
  const { data: foreignSessions } = await dbB.from("teaching_sessions").select("id,lesson_note").eq("id", first.id);
  expect(foreignWorkplaces).toEqual([]);
  expect(foreignSessions).toEqual([]);
  const { error: foreignWrite } = await dbB.from("session_attendance").insert({
    teacher_id: teacherBId, session_id: first.id, student_id: stu1.id, status: "present",
  });
  expect(foreignWrite).toBeTruthy();
  const dbAnon = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: anonymous, error: anonymousError } = await dbAnon
    .from("teaching_sessions").select("id").eq("id", first.id);
  // The anon role has zero table privileges: PostgREST may return a denial
  // rather than an empty RLS-filtered result. Both are secure outcomes.
  expect(anonymousError || (anonymous?.length === 0)).toBeTruthy();
});
