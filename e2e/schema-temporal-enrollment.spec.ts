import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("temporal memberships allow separate periods, reject overlap and preserve unknown legacy starts", async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const makeTeacher = async () => {
    const email = "temporal-synthetic-" + randomUUID() + "@example.test";
    const { data: auth, error: authError } = await admin.auth.admin.createUser({
      email, password: "SyntheticPassword-123!", email_confirm: true,
    });
    expect(authError).toBeNull();
    const id = auth.user!.id;
    const { error: teacherError } = await admin.from("teachers").insert({
      id, email, display_name: "Synthetic temporal teacher",
    });
    expect(teacherError).toBeNull();
    const { data: workplace, error: workplaceError } = await admin.from("workplaces")
      .select("id").eq("teacher_id", id).limit(1).single();
    expect(workplaceError).toBeNull();
    return { id, workplaceId: workplace!.id as string };
  };
  const first = await makeTeacher();
  const second = await makeTeacher();
  try {
    const { data: student, error: studentError } = await admin.from("students").insert({
      teacher_id: first.id, name: "Synthetic student " + randomUUID(),
    }).select("id").single();
    expect(studentError).toBeNull();
    const { data: foreign, error: foreignError } = await admin.from("students").insert({
      teacher_id: second.id, name: "Foreign synthetic student " + randomUUID(),
    }).select("id").single();
    expect(foreignError).toBeNull();
    const studentId = student!.id as string;
    const pair = { teacher_id: first.id, student_id: studentId,
      workplace_id: first.workplaceId };
    const { data: jan, error: janError } = await admin.from("workplace_enrollments")
      .insert({ ...pair, starts_on: "2026-01-01", ends_on: "2026-01-31" })
      .select("id,starts_on,ends_on,revision").single();
    expect(janError).toBeNull();
    expect(jan).toMatchObject({
      starts_on: "2026-01-01", ends_on: "2026-01-31", revision: 1,
    });
    const { data: feb, error: febError } = await admin.from("workplace_enrollments")
      .insert({ ...pair, starts_on: "2026-02-01" })
      .select("id,starts_on,ends_on").single();
    expect(febError).toBeNull();
    expect(feb).toMatchObject({ starts_on: "2026-02-01", ends_on: null });
    expect(feb!.id).not.toBe(jan!.id);
    const { error: overlapError } = await admin.from("workplace_enrollments")
      .insert({ ...pair, starts_on: "2026-01-15", ends_on: "2026-03-01" });
    expect(overlapError?.code).toBe("23P01");
    const { error: foreignLinkError } = await admin.from("workplace_enrollments")
      .insert({ teacher_id: first.id, workplace_id: first.workplaceId,
        student_id: foreign!.id, starts_on: "2027-01-01" });
    expect(foreignLinkError?.code).toBe("23503");
    const { data: other, error: otherError } = await admin.from("students").insert({
      teacher_id: first.id, name: "Unknown-start synthetic student " + randomUUID(),
    }).select("id").single();
    expect(otherError).toBeNull();
    const { data: unknown, error: unknownError } = await admin.from("workplace_enrollments")
      .insert({ teacher_id: first.id, student_id: other!.id,
        workplace_id: first.workplaceId, source: "legacy_operator",
        start_date_unknown: true, starts_on: null, ends_on: "2025-12-31" })
      .select("starts_on,start_date_unknown,source").single();
    expect(unknownError).toBeNull();
    expect(unknown).toMatchObject({
      starts_on: null, start_date_unknown: true, source: "legacy_operator",
    });
    // A payer must fit inside a single verified period, even when a student
    // has attended the same workplace in two adjacent historical periods.
    const { data: billing, error: billingError } = await admin.from("billing_accounts")
      .insert({ teacher_id: first.id, display_name: "Synthetic school payer" })
      .select("id").single();
    expect(billingError).toBeNull();
    const payer = { teacher_id: first.id, student_id: studentId,
      workplace_id: first.workplaceId, billing_account_id: billing!.id as string };
    const { data: validPayer, error: validPayerError } =
      await admin.from("student_billing_assignments")
        .insert({ ...payer, effective_from: "2026-01-10", effective_to: "2026-01-20" })
        .select("id").single();
    expect(validPayerError).toBeNull();
    expect(validPayer?.id).toBeTruthy();
    const { error: acrossPeriodError } = await admin.from("student_billing_assignments")
      .insert({ ...payer, effective_from: "2026-01-22", effective_to: "2026-02-15" });
    expect(acrossPeriodError?.code).toBe("23503");
    // An open February enrollment legitimately covers future dates.
    const { error: beforePeriodError } = await admin.from("student_billing_assignments")
      .insert({ ...payer, effective_from: "2025-12-01", effective_to: "2025-12-31" });
    expect(beforePeriodError?.code).toBe("23503");
    const { error: changePayerError } = await admin.from("student_billing_assignments")
      .update({ billing_account_id: billing!.id, effective_from: "2026-01-09" })
      .eq("id", validPayer!.id);
    expect(changePayerError?.code).toBe("23514");
    const { error: legacyUnknownPayerError } =
      await admin.from("student_billing_assignments").insert({
        teacher_id: first.id, student_id: other!.id,
        workplace_id: first.workplaceId, billing_account_id: billing!.id,
        effective_from: "2025-12-01", effective_to: "2025-12-10",
      });
    expect(legacyUnknownPayerError?.code).toBe("23503");

    const agreement = { teacher_id: first.id, workplace_id: first.workplaceId,
      student_id: studentId, billing_account_id: billing!.id as string,
      agreement_role: "participant_charge", model: "per_session",
      rate_cents: 1500, currency: "USD", status: "active" };
    const { data: validAgreement, error: agreementError } =
      await admin.from("compensation_agreements").insert({
        ...agreement, effective_from: "2026-01-10", effective_to: "2026-01-20",
      }).select("id").single();
    expect(agreementError).toBeNull();
    expect(validAgreement?.id).toBeTruthy();
    const { error: invalidAgreementError } =
      await admin.from("compensation_agreements").insert({
        ...agreement, effective_from: "2026-01-22", effective_to: "2026-02-15",
      });
    expect(invalidAgreementError?.code).toBe("23503");

    const { data: adjusted, error: adjustError } = await admin.from("workplace_enrollments")
      .update({ ends_on: "2026-12-31" }).eq("id", feb!.id)
      .select("revision,ends_on").single();
    expect(adjustError).toBeNull();
    expect(adjusted).toMatchObject({ ends_on: "2026-12-31", revision: 2 });
  } finally {
    const [a, b] = await Promise.all([
      admin.auth.admin.deleteUser(first.id), admin.auth.admin.deleteUser(second.id),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  }
});
