import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { SEED_TEACHER } from "./helpers/auth";

/**
 * M4 security contract: exercise actual PostgREST RLS, not mocked application
 * services. The GitHub E2E workflow starts a disposable, synthetic Supabase.
 * Never point this test at a real tenant or an existing developer database.
 */
test("M4 real database: foreign coaching IDs, writes, anonymous access and guest token abuse are denied", async ({ request }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey || !url.includes("127.0.0.1")) {
    throw new Error("M4 destructive fixture requires GitHub's localhost synthetic Supabase");
  }

  const createClientNoPersistence = (key: string) =>
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClientNoPersistence(serviceKey);
  const teacherA = createClientNoPersistence(anonKey);
  const { data: signedInA, error: signInError } = await teacherA.auth.signInWithPassword(SEED_TEACHER);
  expect(signInError).toBeNull();
  const aId = signedInA.user!.id;
  const tokenA = signedInA.session!.access_token;

  const suffix = randomUUID().slice(0, 10);
  const email = `m4-tenant-${suffix}@example.com`;
  const password = "SyntheticPassword-123!";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  expect(createError).toBeNull();
  const bId = created.user!.id;
  const { error: bTeacherError } = await admin.from("teachers").insert({
    id: bId, email, display_name: "Synthetic RLS Teacher",
  });
  expect(bTeacherError).toBeNull();
  const teacherB = createClientNoPersistence(anonKey);
  const { error: signInBError } = await teacherB.auth.signInWithPassword({ email, password });
  expect(signInBError).toBeNull();

  const action = async (token: string, body: Record<string, unknown>) => {
    const result = await request.post("/api/agent/v1", {
      data: body, headers: { Authorization: `Bearer ${token}` },
    });
    return { status: result.status(), body: await result.json() };
  };
  const asA = async (body: Record<string, unknown>) => {
    const result = await action(tokenA, body);
    expect([200, 201], JSON.stringify(result.body)).toContain(result.status);
    return result.body.data;
  };

  const w = await asA({ action: "workplaces.create", name: `M4 confidential club ${suffix}`, timezone: "UTC", currency: "USD" });
  const student = await asA({ action: "students.create", name: `M4 private learner ${suffix}` });
  const group = await asA({ action: "groups.create", name: `M4 private group ${suffix}`, workplaceId: w.id });
  await asA({ action: "groups.enroll", groupId: group.id, studentId: student.id });
  const session = await asA({
    action: "sessions.create", workplaceId: w.id, groupId: group.id,
    title: `M4 confidential session ${suffix}`, lessonNote: `M4 private note ${suffix}`,
    startsAt: "2027-07-01T16:00:00.000Z", durationMinutes: 60, requestId: randomUUID(),
  });

  const ownTables: Array<{ table: string; field: string; id: string }> = [
    { table: "workplaces", field: "id", id: w.id },
    { table: "class_groups", field: "id", id: group.id },
    { table: "teaching_sessions", field: "id", id: session.id },
    { table: "students", field: "id", id: student.id },
  ];
  for (const { table, field, id } of ownTables) {
    const ownerRead = await teacherA.from(table).select("*").eq(field, id);
    expect(ownerRead.error, `owner ${table}`).toBeNull();
    expect(ownerRead.data, `owner ${table}`).toHaveLength(1);

    const foreignRead = await teacherB.from(table).select("*").eq(field, id);
    expect(foreignRead.error, `RLS foreign ${table}`).toBeNull();
    expect(foreignRead.data, `foreign ${table}`).toEqual([]);

    const unauthenticated = createClientNoPersistence(anonKey);
    const noAuthRead = await unauthenticated.from(table).select("*").eq(field, id);
    expect(noAuthRead.error || noAuthRead.data?.length === 0, `anon ${table}`).toBeTruthy();
  }

  for (const table of ["workplace_enrollments", "group_enrollments", "session_participants", "session_attendance"]) {
    const foreignRead = await teacherB.from(table).select("*").eq("teacher_id", aId);
    expect(foreignRead.error, `foreign junction ${table}`).toBeNull();
    expect(foreignRead.data).toEqual([]);
  }

  const updated = await teacherB.from("teaching_sessions")
    .update({ lesson_note: "Unauthorised change" }).eq("id", session.id).select();
  expect(updated.error || updated.data?.length === 0).toBeTruthy();
  const deleted = await teacherB.from("teaching_sessions").delete().eq("id", session.id).select();
  expect(deleted.error || deleted.data?.length === 0).toBeTruthy();
  const inject = await teacherB.from("session_attendance").insert({
    teacher_id: bId, session_id: session.id, student_id: student.id, status: "present",
  });
  expect(inject.error).toBeTruthy();

  const { data: unchanged } = await teacherA.from("teaching_sessions")
    .select("lesson_note").eq("id", session.id).single();
  expect(unchanged?.lesson_note).toBe(`M4 private note ${suffix}`);

  const tokenB = (await teacherB.auth.getSession()).data.session!.access_token;
  for (const body of [
    { action: "sessions.participants", sessionId: session.id },
    { action: "attendance.list", sessionId: session.id },
    { action: "sessions.update", sessionId: session.id, lessonNote: "tampered" },
  ]) {
    const denied = await action(tokenB, body);
    expect(denied.status).toBe(404);
    expect(JSON.stringify(denied.body)).not.toContain(suffix);
  }

  // A service-role JWT is not a teacher identity and must not open the agent API.
  const privilegedProbe = await action(serviceKey, { action: "sessions.list" });
  expect(privilegedProbe.status).toBeGreaterThanOrEqual(400);
  const unknownPortal = await request.get(`/portal/${randomUUID()}`);
  expect(unknownPortal.status()).toBe(404);
});
