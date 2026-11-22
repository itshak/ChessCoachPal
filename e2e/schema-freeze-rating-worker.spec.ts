import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const dbOpts = { auth: { persistSession: false, autoRefreshToken: false } };
const adminClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, dbOpts);
const userClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, dbOpts);
const inputDigest = "a".repeat(64);
const evidenceDigest = "b".repeat(64);
const handle = "SyntheticOnlineWorker";
const observedAt = "2024-01-22T12:00:00.000Z";

type Admin = ReturnType<typeof adminClient>;
type Lease = { leaseToken: string; leaseUntil: string; attempt: number };

async function setup() {
  const admin = adminClient();
  const email = "freeze-rating-" + randomUUID() + "@example.com";
  const password = "SchemaRatingSynthetic123!";
  const identity = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(identity.error).toBeNull();
  const teacherId = identity.data.user!.id;
  expect((await admin.from("teachers").insert({
    id: teacherId, email, display_name: "Synthetic online rating worker",
  })).error).toBeNull();
  const student = await admin.from("students").insert({
    teacher_id: teacherId, name: "Synthetic online student", lichess_username: handle,
  }).select("id").single();
  expect(student.error).toBeNull();
  const studentId = student.data!.id as string;
  const consent = await admin.from("student_rating_sync_consents").insert({
    teacher_id: teacherId, student_id: studentId, provider: "lichess",
    source_username: handle, enabled: true, consented_at: new Date().toISOString(),
  }).select("id").single();
  expect(consent.error).toBeNull();
  const consentId = consent.data!.id as string;
  const job = await admin.from("student_rating_refresh_jobs").insert({
    teacher_id: teacherId, student_id: studentId, consent_id: consentId, provider: "lichess",
    source_username: handle, handle_revision: 1, input_digest: inputDigest,
    idempotency_key: randomUUID(), trigger_kind: "manual",
  }).select("id").single();
  expect(job.error).toBeNull();
  const jobId = job.data!.id as string;
  const cleanup = async () => {
    expect((await admin.from("student_rating_snapshots").delete().eq("teacher_id", teacherId)).error).toBeNull();
    expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
  };
  return { admin, teacherId, studentId, consentId, jobId, email, password, cleanup };
}

function claim(db: Admin, teacherId: string, jobId: string) {
  return db.rpc("ccp_rating_refresh_claim", { p_teacher_id: teacherId, p_job_id: jobId });
}

function result(teacherId: string, jobId: string, lease: Lease) {
  const fetchedAt = new Date(Date.parse(lease.leaseUntil) - 120_000).toISOString();
  return {
    p_teacher_id: teacherId, p_job_id: jobId, p_lease_token: lease.leaseToken,
    p_attempt: lease.attempt, p_input_digest: inputDigest, p_outcome: "succeeded",
    p_fetched_at: fetchedAt, p_evidence_digest: evidenceDigest, p_error_code: null,
    p_observations: [
      { time_control: "blitz", rating: 1775, games: 5, observed_at: observedAt },
      { time_control: "rapid", rating: 1820, provisional: false, observed_at: observedAt },
    ],
  };
}

test("rating worker is service-only, claims exclusively, rolls back a bad batch and replays exactly", async () => {
  const {admin,teacherId,studentId,jobId,email,password,cleanup} = await setup();
  try {
    const anon = userClient();
    expect((await claim(anon,teacherId,jobId)).error?.code).toBe("42501");
    const signed = userClient();
    expect((await signed.auth.signInWithPassword({email,password})).error).toBeNull();
    expect((await claim(signed,teacherId,jobId)).error?.code).toBe("42501");
    const foreign = await claim(admin,randomUUID(),jobId);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toBeNull();
    // Two distinct runtime clients send overlapping PostgREST transactions.
    const contenders = await Promise.all([
      claim(admin,teacherId,jobId), claim(adminClient(),teacherId,jobId),
    ]);
    expect(contenders.every(x=>!x.error)).toBeTruthy();
    const winners = contenders.filter(x=>x.data);
    expect(winners).toHaveLength(1);
    const lease = winners[0].data as Lease;
    expect(lease.attempt).toBe(1);
    const submitted = result(teacherId,jobId,lease);
    expect((await signed.rpc("ccp_rating_refresh_finalize",submitted)).error?.code).toBe("42501");
    expect((await admin.rpc("ccp_rating_refresh_finalize",{
      ...submitted,p_lease_token:randomUUID(),
    })).data).toBeNull();
    expect((await admin.rpc("ccp_rating_refresh_finalize",{
      ...submitted,p_teacher_id:randomUUID(),
    })).data).toBeNull();
    const invalid = await admin.rpc("ccp_rating_refresh_finalize",{
      ...submitted,p_observations:[submitted.p_observations[0],submitted.p_observations[0]],
    });
    expect(invalid.error?.code).toBe("22023");
    expect((await admin.from("student_rating_snapshots").select("id").eq("student_id",studentId)).data).toEqual([]);
    expect((await admin.from("student_rating_refresh_receipts").select("id").eq("job_id",jobId)).data).toEqual([]);
    expect((await admin.from("student_rating_refresh_jobs").select("status,lease_token")
      .eq("id",jobId).single()).data).toEqual({status:"running",lease_token:lease.leaseToken});

    const completions = await Promise.all([
      admin.rpc("ccp_rating_refresh_finalize",submitted),
      adminClient().rpc("ccp_rating_refresh_finalize",submitted),
    ]);
    expect(completions.every(x=>!x.error)).toBeTruthy();
    expect(completions.map(x=>x.data?.replayed).sort()).toEqual([false,true]);
    expect(completions.every(x=>x.data?.status==="succeeded"&&x.data?.snapshotsWritten===2)).toBeTruthy();
    const mismatched = await admin.rpc("ccp_rating_refresh_finalize",{
      ...submitted,p_observations:[{...submitted.p_observations[0],rating:1776},submitted.p_observations[1]],
    });
    expect(mismatched.error?.code).toBe("23505");
    expect((await admin.from("student_rating_refresh_jobs").select("status,lease_token,finished_at")
      .eq("id",jobId).single()).data).toMatchObject({status:"succeeded",lease_token:null,finished_at:expect.any(String)});
    const snapshots = await admin.from("student_rating_snapshots")
      .select("time_control,rating,source_username,source_handle_revision,verification_state,source_digest")
      .eq("student_id",studentId).order("time_control");
    expect(snapshots.data).toEqual([
      {time_control:"blitz",rating:1775,source_username:handle,source_handle_revision:1,verification_state:"unverified",source_digest:evidenceDigest},
      {time_control:"rapid",rating:1820,source_username:handle,source_handle_revision:1,verification_state:"unverified",source_digest:evidenceDigest},
    ]);
    const receipts = await admin.from("student_rating_refresh_receipts")
      .select("outcome,snapshots_written,evidence_digest").eq("job_id",jobId);
    expect(receipts.data).toEqual([{outcome:"succeeded",snapshots_written:2,evidence_digest:evidenceDigest}]);
  } finally { await cleanup(); }
});

for (const invalidation of ["revoked","revoked-regranted","changed-away-and-back","archived"] as const) {
  test("rating worker suppresses observations after " + invalidation, async () => {
    const {admin,teacherId,studentId,consentId,jobId,email,password,cleanup} = await setup();
    try {
      const active = await claim(admin,teacherId,jobId);
      expect(active.error).toBeNull();
      const lease = active.data as Lease;
      if (invalidation === "revoked" || invalidation === "revoked-regranted") {
        expect((await admin.from("student_rating_sync_consents")
          .update({enabled:false,revoked_at:new Date().toISOString()}).eq("id",consentId)).error).toBeNull();
        expect((await admin.from("student_rating_sync_consents").select("enabled,handle_revision")
          .eq("id",consentId).single()).data).toEqual({enabled:false,handle_revision:2});
        if (invalidation === "revoked-regranted") {
          expect((await admin.from("student_rating_sync_consents")
            .update({enabled:true,revoked_at:null,consented_at:new Date().toISOString()})
            .eq("id",consentId)).error).toBeNull();
        }
      } else if (invalidation === "changed-away-and-back") {
        expect((await admin.from("students").update({lichess_username:"NewWorkerHandle"})
          .eq("id",studentId)).error).toBeNull();
        expect((await admin.from("students").update({lichess_username:handle})
          .eq("id",studentId)).error).toBeNull();
        expect((await admin.from("student_rating_sync_consents").select("enabled,handle_revision")
          .eq("id",consentId).single()).data).toEqual({enabled:false,handle_revision:3});
      } else {
        const signed = userClient();
        expect((await signed.auth.signInWithPassword({email,password})).error).toBeNull();
        const preview = await signed.rpc("ccp_student_lifecycle_preview",{p_student_id:studentId});
        expect(preview.error).toBeNull();
        expect(preview.data?.canArchive).toBe(true);
        const archive = await signed.rpc("ccp_student_lifecycle_commit",{
          p_student_id:studentId,p_mode:"archive",
          p_expected_updated_at:preview.data.expectedUpdatedAt,p_selected_workplaces:[],
          p_request_id:randomUUID(),p_reason:"Synthetic reviewed archive for rating lease acceptance",
          p_confirmed:true,
        });
        expect(archive.error).toBeNull();
        expect(archive.data?.archived).toBe(true);
      }
      const finalized = await admin.rpc("ccp_rating_refresh_finalize",result(teacherId,jobId,lease));
      expect(finalized.error).toBeNull();
      expect(finalized.data).toMatchObject({status:"stale",snapshotsWritten:0});
      expect((await admin.from("student_rating_snapshots").select("id").eq("student_id",studentId)).data).toEqual([]);
      expect((await admin.from("student_rating_refresh_receipts").select("outcome,snapshots_written")
        .eq("job_id",jobId)).data).toEqual([{outcome:"stale",snapshots_written:0}]);
      expect((await claim(admin,teacherId,jobId)).data).toBeNull();
    } finally { await cleanup(); }
  });
}

test("a previously revoked queued job is not admitted or exposed to a worker", async () => {
  const {admin,teacherId,consentId,jobId,cleanup} = await setup();
  try {
    expect((await admin.from("student_rating_sync_consents")
      .update({enabled:false,revoked_at:new Date().toISOString()}).eq("id",consentId)).error).toBeNull();
    const attempted = await claim(admin,teacherId,jobId);
    expect(attempted.error).toBeNull();
    expect(attempted.data).toBeNull();
    expect((await admin.from("student_rating_refresh_jobs").select("status,attempt_count,lease_token")
      .eq("id",jobId).single()).data).toEqual({status:"stale",attempt_count:0,lease_token:null});
    expect((await admin.from("student_rating_refresh_receipts").select("id").eq("job_id",jobId)).data).toEqual([]);
  } finally { await cleanup(); }
});

test("rating worker refuses expired leases and only the replacement can finalize", async () => {
  const {admin,teacherId,studentId,jobId,cleanup} = await setup();
  try {
    const active = await claim(admin,teacherId,jobId);
    expect(active.error).toBeNull();
    const before = active.data as Lease;
    expect((await admin.from("student_rating_refresh_jobs")
      .update({lease_until:"2024-01-01T00:00:00.000Z"}).eq("id",jobId)).error).toBeNull();
    const expired = await admin.rpc("ccp_rating_refresh_finalize",result(teacherId,jobId,before));
    expect(expired.error).toBeNull();
    expect(expired.data).toBeNull();
    expect((await admin.from("student_rating_snapshots").select("id").eq("student_id",studentId)).data).toEqual([]);
    const reclaimed = await claim(admin,teacherId,jobId);
    expect(reclaimed.error).toBeNull();
    const after = reclaimed.data as Lease;
    expect(after.attempt).toBe(2);
    expect(after.leaseToken).not.toBe(before.leaseToken);
    const lateReplay = await admin.rpc("ccp_rating_refresh_finalize",result(teacherId,jobId,before));
    expect(lateReplay.error).toBeNull();
    expect(lateReplay.data).toBeNull();
    const success = await admin.rpc("ccp_rating_refresh_finalize",result(teacherId,jobId,after));
    expect(success.error).toBeNull();
    expect(success.data).toMatchObject({status:"succeeded",snapshotsWritten:2});
    expect((await admin.from("student_rating_refresh_receipts").select("outcome,attempt_number,snapshots_written")
      .eq("job_id",jobId).order("attempt_number")).data).toEqual([
      {outcome:"retry",attempt_number:1,snapshots_written:0},
      {outcome:"succeeded",attempt_number:2,snapshots_written:2},
    ]);
  } finally { await cleanup(); }
});
