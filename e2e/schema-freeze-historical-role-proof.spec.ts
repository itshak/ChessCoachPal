import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const client = (service = false) => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (service ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
type DB = ReturnType<typeof client>;

async function insert(db: DB, table: string, values: Record<string, unknown>) {
  const result = await db.from(table).insert(values).select("id").single();
  expect(result.error, table + " fixture insert").toBeNull();
  return result.data!.id as string;
}

async function withTeachers(run: (fx: {
  service: DB; anon: DB; owner: DB; foreign: DB; teacherId: string; otherId: string;
  eraseOwner: () => Promise<void>;
}) => Promise<void>) {
  const service = client(true);
  const ids: string[] = [];
  try {
    const signed = [];
    for (let i = 0; i < 2; ++i) {
      const email = "historical-role-" + randomUUID() + "@example.invalid";
      const password = "SyntheticHistorical123!";
      const identity = await service.auth.admin.createUser({ email, password, email_confirm: true });
      expect(identity.error).toBeNull();
      const id = identity.data.user!.id;
      ids.push(id);
      await insert(service, "teachers", { id, email, display_name: "Synthetic teacher" });
      const viewer = client();
      expect((await viewer.auth.signInWithPassword({ email, password })).error).toBeNull();
      signed.push(viewer);
    }
    await run({ service, anon: client(), owner: signed[0], foreign: signed[1],
      teacherId: ids[0], otherId: ids[1], eraseOwner: async () => {
        expect((await service.auth.admin.deleteUser(ids[0])).error).toBeNull();
        ids.shift();
      } });
  } finally {
    for (const id of ids) {
      expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
}

async function boundary(
  fx: { service: DB; owner: DB; foreign: DB; anon: DB },
  table: string, id: string, column: string, value: string | number, anonymousGrant = false,
) {
  for (const reader of [fx.owner, fx.service]) {
    const result = await reader.from(table).select(column).eq("id", id);
    expect(result.error, table + " owner/service read").toBeNull();
    expect(result.data, table + " real owner/service row").toEqual([{ [column]: value }]);
  }
  const outside = await fx.foreign.from(table).select(column).eq("id", id);
  expect(outside.error, table + " foreign read").toBeNull();
  expect(outside.data, table + " known foreign row hidden").toEqual([]);
  const anonymous = await fx.anon.from(table).select(column).eq("id", id);
  if (anonymousGrant) {
    expect(anonymous.error, table + " anonymous RLS").toBeNull();
    expect(anonymous.data, table + " no anonymous rows").toEqual([]);
  } else {
    expect(anonymous.error?.code, table + " anonymous grant").toBe("42501");
  }
}

test("historical learner evidence is tenant scoped; signed manual ratings cannot claim provider provenance", async () => {
  await withTeachers(async fx => {
    const { service, anon, owner, foreign, teacherId, otherId } = fx;
    const studentId = await insert(service, "students", { teacher_id: teacherId, name: "Private learner" });
    const otherStudentId = await insert(service, "students", { teacher_id: otherId, name: "Other learner" });
    const categoryId = await insert(service, "chess_skill_categories",
      { teacher_id: teacherId, name: "Synthetic evidence category" });
    const observedAt = "2025-01-20T12:00:00Z";
    const observation = { teacher_id: teacherId, student_id: studentId, category_id: categoryId,
      source: "teacher", observation: "Private observation",
      verified_by: teacherId, verified_at: observedAt, observed_at: observedAt };
    const observationId = await insert(owner, "chess_observations", observation);
    const materialId = await insert(service, "learning_materials", {
      teacher_id: teacherId, kind: "external_link", title: "Synthetic evidence source",
      source_url: "https://lichess.org/study/abcdef", request_id: randomUUID(), request_hash: randomUUID(),
    });
    const material = { teacher_id: teacherId, student_id: studentId, material_id: materialId,
      occurred_on: "2025-01-20", stage: "taught", note: "Private material note" };
    const evidenceId = await insert(owner, "material_teaching_evidence", {
      ...material, request_id: randomUUID(),
    });
    const rating = { teacher_id: teacherId, student_id: studentId, provider: "lichess",
      time_control: "blitz", observed_at: observedAt, rating: 1600 };
    const snapshotId = await insert(owner, "student_rating_snapshots", {
      ...rating, source: "teacher_manual", verification_state: "unverified", request_id: randomUUID(),
    });
    // Use a valid provider evidence row as a service control. An otherwise
    // valid owner request must fail at the RLS source boundary, not row shape.
    const providerRating = { ...rating, source: "provider_api", verification_state: "unverified",
      fetched_at: observedAt, preview_digest: "a".repeat(64), source_username: "SyntheticRank",
      rating: 1700 };
    expect((await owner.from("student_rating_snapshots").insert({
      ...providerRating, request_id: randomUUID(),
    })).error?.code).toBe("42501");
    const importedId = await insert(service, "student_rating_snapshots", {
      ...providerRating, request_id: randomUUID(),
    });
    for (const [table, id, patch] of [
      ["chess_observations", observationId, { observation: "Not the owner" }],
      ["material_teaching_evidence", evidenceId, { note: "Not the owner" }],
    ] as const) {
      const result = await foreign.from(table).update(patch).eq("id", id).select("id");
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
    expect((await owner.from("chess_observations").insert({
      ...observation, student_id: otherStudentId,
    })).error?.code).toBe("23503");
    for (const id of [snapshotId, importedId]) {
      expect((await owner.from("student_rating_snapshots").update({ rating: 1800 })
        .eq("id", id)).error?.code).toBe("42501");
      expect((await owner.from("student_rating_snapshots").delete().eq("id", id)).error?.code).toBe("42501");
    }
    expect((await anon.from("student_rating_snapshots").insert({
      ...rating, source: "teacher_manual", verification_state: "unverified", request_id: randomUUID(),
    })).error?.code).toBe("42501");
    await boundary(fx, "chess_observations", observationId, "observation", "Private observation", true);
    await boundary(fx, "material_teaching_evidence", evidenceId, "note", "Private material note");
    await boundary(fx, "student_rating_snapshots", snapshotId, "rating", 1600);
    await boundary(fx, "student_rating_snapshots", importedId, "source", "provider_api");
  });
});

test("a posted obligation protects an otherwise pristine future lesson even in a direct service write", async () => {
  await withTeachers(async fx => {
    const { service, owner, foreign, teacherId } = fx;
    const workplace = await service.from("workplaces").select("id")
      .eq("teacher_id", teacherId).eq("kind", "personal").single();
    expect(workplace.error).toBeNull();
    const workplaceId = workplace.data!.id as string;
    const scope = { teacher_id: teacherId, workplace_id: workplaceId };
    const payerId = await insert(service, "billing_accounts", {
      teacher_id: teacherId, display_name: "Synthetic institution", account_kind: "organization",
    });
    const agreement = { ...scope, billing_account_id: payerId, agreement_role: "coach_earning",
      model: "per_session", rate_cents: 1500, currency: "USD", effective_from: "2060-01-01" };
    const agreementId = await insert(service, "compensation_agreements", agreement);
    const studentId = await insert(service, "students", {
      teacher_id: teacherId, name: "Synthetic financed learner",
    });
    expect((await service.from("workplace_enrollments").insert({
      ...scope, student_id: studentId, starts_on: "2025-01-01", source: "manual",
    })).error).toBeNull();
    const sessionId = await insert(service, "teaching_sessions", {
      ...scope, student_id: studentId, title: "Synthetic financed lesson", starts_at: "2060-02-02T14:00:00Z",
      duration_minutes: 45, status: "scheduled", local_timezone: "UTC",
    });
    // Positive control: raw duration remains editable before the only
    // protected linkage is attached, on exactly the same future lesson.
    const editable = await owner.from("teaching_sessions").update({ duration_minutes: 50 })
      .eq("id", sessionId).select("duration_minutes").single();
    expect(editable.error).toBeNull();
    expect(editable.data?.duration_minutes).toBe(50);
    const obligation = { ...scope, billing_account_id: payerId, agreement_id: agreementId,
      agreement_revision: 1, agreement_snapshot: agreement, session_id: sessionId,
      period_start: "2060-02-02", period_end: "2060-02-02", kind: "coach_earning",
      amount_cents: 1500, currency: "USD", source_key: "synthetic:" + sessionId,
      source_hash: "b".repeat(64), approval_request_id: randomUUID() };
    expect((await owner.from("financial_obligations").insert(obligation)).error?.code).toBe("42501");
    const obligationId = await insert(service, "financial_obligations", obligation);
    for (const db of [owner, service]) {
      for (const change of [{ duration_minutes: 55 }, { status: "cancelled" }]) {
        expect((await db.from("teaching_sessions").update(change).eq("id", sessionId)).error)
          .toMatchObject({ code: "23514", message: "SESSION_SCHEDULE_HISTORY_CONFLICT" });
      }
      expect((await db.from("teaching_sessions").delete().eq("id", sessionId)).error?.code).toBe("23503");
    }
    const hiddenUpdate = await foreign.from("teaching_sessions")
      .update({ title: "Not the owner" }).eq("id", sessionId).select("id");
    expect(hiddenUpdate.error).toBeNull();
    expect(hiddenUpdate.data).toEqual([]);
    const allowed = await owner.from("teaching_sessions").update({ title: "Reviewed title" })
      .eq("id", sessionId).select("duration_minutes,status").single();
    expect(allowed.error).toBeNull();
    expect(allowed.data).toEqual({ duration_minutes: 50, status: "scheduled" });
    await boundary(fx, "teaching_sessions", sessionId, "title", "Reviewed title", true);
    await boundary(fx, "financial_obligations", obligationId, "session_id", sessionId);
  });
});


test("a signed owner can void but cannot hard-delete material history; privileged identity erasure still cascades", async () => {
  await withTeachers(async ({ service, owner, teacherId, eraseOwner }) => {
    const studentId = await insert(service, "students", { teacher_id: teacherId, name: "Verified learner" });
    const materialId = await insert(service, "learning_materials", {
      teacher_id: teacherId, kind: "external_link", title: "Verified synthetic evidence source",
      source_url: "https://lichess.org/study/abcdef", request_id: randomUUID(), request_hash: randomUUID(),
    });
    const base = {
      teacher_id: teacherId, student_id: studentId, material_id: materialId,
      occurred_on: "2025-01-20", stage: "taught", note: "Synthetic historical material",
    };
    const verification = { learning_stage: "demonstrated", stage_verified_by: teacherId,
      stage_verified_at: "2025-01-20T12:00:00Z" };
    const verified = await insert(owner, "material_teaching_evidence",
      { ...base, ...verification, request_id: randomUUID() });
    const voided = await insert(owner, "material_teaching_evidence",
      { ...base, ...verification, request_id: randomUUID() });
    const unassessed = await insert(owner, "material_teaching_evidence",
      { ...base, request_id: randomUUID() });
    const voidUpdate = await owner.from("material_teaching_evidence")
      .update({ voided_at: "2025-01-21T12:00:00Z", void_reason: "Teacher reviewed correction" })
      .eq("id", voided).select("id,learning_stage,void_reason").single();
    expect(voidUpdate.error).toBeNull();
    expect(voidUpdate.data).toEqual({ id: voided, learning_stage: "demonstrated",
      void_reason: "Teacher reviewed correction" });
    for (const id of [verified, voided, unassessed]) {
      const attempted = await owner.from("material_teaching_evidence").delete().eq("id", id).select("id");
      const stored = await service.from("material_teaching_evidence").select("id").eq("id", id);
      expect(stored.error).toBeNull();
      expect({ denial: attempted.error?.code ?? null, deleted: attempted.data, retained: stored.data })
        .toEqual({ denial: "42501", deleted: null, retained: [{ id }] });
    }
    expect((await owner.from("students").delete().eq("id", studentId)).error)
      .toMatchObject({ code: "23503", message: "HISTORY_DEPENDENCIES" });
    const materialDelete = await owner.from("learning_materials").delete().eq("id", materialId);
    // Both a role denial and the restrictive evidence FK protect the catalog parent.
    expect(["42501", "23503"]).toContain(materialDelete.error?.code);
    const survivingParent = await service.from("learning_materials").select("id").eq("id", materialId);
    expect(survivingParent.error).toBeNull();
    expect(survivingParent.data).toEqual([{ id: materialId }]);
    await eraseOwner();
    const afterErase = await service.from("material_teaching_evidence").select("id")
      .in("id", [verified, voided, unassessed]);
    expect(afterErase.error).toBeNull();
    expect(afterErase.data).toEqual([]);
  });
});
