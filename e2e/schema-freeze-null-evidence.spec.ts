import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const serviceClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession:false, autoRefreshToken:false } });

async function fixture() {
  const db = serviceClient();
  const email = "freeze-null-evidence-" + randomUUID() + "@example.com";
  const password = "SchemaNullEvidence123!";
  const identity = await db.auth.admin.createUser({
    email, password, email_confirm:true,
  });
  expect(identity.error).toBeNull();
  const teacherId = identity.data.user!.id;
  expect((await db.from("teachers").insert({
    id:teacherId,email,display_name:"Synthetic reviewed evidence",
  })).error).toBeNull();
  const student = await db.from("students").insert({
    teacher_id:teacherId,name:"Synthetic evidence learner",
  }).select("id").single();
  expect(student.error).toBeNull();
  return { db,teacherId,studentId:student.data!.id as string,email,password };
}

test("material assessment requires a real owner verifier; legacy unassessed evidence remains valid", async ()=>{
  const {db,teacherId,studentId} = await fixture();
  try {
    const material = await db.from("learning_materials").insert({
      teacher_id:teacherId,kind:"external_link",title:"Synthetic source",
      description:"No production data or network required",
      source_url:"https://lichess.org/study/abcdef",
      request_id:randomUUID(),request_hash:randomUUID(),
    }).select("id").single();
    expect(material.error).toBeNull();
    const base = {
      teacher_id:teacherId,student_id:studentId,material_id:material.data!.id,
      occurred_on:"2024-03-02",stage:"taught",
    };
    const legacy = await db.from("material_teaching_evidence").insert({
      ...base,request_id:randomUUID(),
    }).select("learning_stage,stage_verified_at,stage_verified_by").single();
    expect(legacy.error).toBeNull();
    expect(legacy.data).toEqual({
      learning_stage:null,stage_verified_at:null,stage_verified_by:null,
    });

    const verifiedAt = "2024-03-02T12:00:00Z";
    for (const partial of [
      {learning_stage:"demonstrated",stage_verified_at:verifiedAt,stage_verified_by:null},
      {learning_stage:"demonstrated",stage_verified_at:verifiedAt,stage_verified_by:randomUUID()},
      {learning_stage:"demonstrated",stage_verified_at:null,stage_verified_by:teacherId},
      {learning_stage:null,stage_verified_at:verifiedAt,stage_verified_by:teacherId},
    ]) {
      const denied = await db.from("material_teaching_evidence").insert({
        ...base,...partial,request_id:randomUUID(),
      });
      expect(denied.error?.code).toBe("23514");
      expect(denied.error?.message).toContain("ccp_material_stage_teacher_evidence");
    }

    const verified = await db.from("material_teaching_evidence").insert({
      ...base,request_id:randomUUID(),learning_stage:"demonstrated",
      stage_verified_at:verifiedAt,stage_verified_by:teacherId,
    }).select("learning_stage,stage_verified_by").single();
    expect(verified.error).toBeNull();
    expect(verified.data).toEqual({learning_stage:"demonstrated",stage_verified_by:teacherId});
  } finally {
    expect((await db.from("material_teaching_evidence").delete().eq("teacher_id",teacherId)).error).toBeNull();
    expect((await db.auth.admin.deleteUser(teacherId)).error).toBeNull();
  }
});

test("occurrence revocation requires the owning actor and a receipt, and failure leaves it active", async ()=>{
  const {db,teacherId,studentId} = await fixture();
  try {
    const workplace = await db.from("workplaces").select("id")
      .eq("teacher_id",teacherId).eq("kind","personal").single();
    expect(workplace.error).toBeNull();
    const slot = await db.from("lesson_slots").insert({
      teacher_id:teacherId,student_id:studentId,workplace_id:workplace.data!.id,
      start_date:"2060-01-05",day_of_week:1,start_time:"14:00:00",duration_minutes:45,
    }).select("id").single();
    expect(slot.error).toBeNull();
    const exception = await db.from("slot_occurrence_exceptions").insert({
      teacher_id:teacherId,slot_id:slot.data!.id,original_occurrence_on:"2060-01-05",
      action:"cancel",approved_by:teacherId,approved_at:"2024-12-01T00:00:00Z",
      reason:"Explicit synthetic one-off cancellation",request_id:randomUUID(),
    }).select("id,revoked_at,revoked_by,revocation_request_id,revision").single();
    expect(exception.error).toBeNull();
    expect(exception.data).toMatchObject({
      revoked_at:null,revoked_by:null,revocation_request_id:null,revision:1,
    });
    const id = exception.data!.id;
    const revokedAt = "2024-12-02T00:00:00Z";
    const receipt = randomUUID();
    for (const partial of [
      {revoked_at:revokedAt,revocation_request_id:receipt,revoked_by:null},
      {revoked_at:revokedAt,revocation_request_id:receipt,revoked_by:randomUUID()},
      {revoked_at:revokedAt,revocation_request_id:null,revoked_by:teacherId},
      {revoked_at:null,revocation_request_id:receipt,revoked_by:teacherId},
    ]) {
      const denied = await db.from("slot_occurrence_exceptions").update(partial).eq("id",id);
      expect(denied.error?.code).toBe("23514");
      expect(denied.error?.message).toContain("ccp_slot_exception_revoke_pair");
    }
    const current = await db.from("slot_occurrence_exceptions")
      .select("revoked_at,revoked_by,revocation_request_id,revision").eq("id",id).single();
    expect(current.error).toBeNull();
    expect(current.data).toEqual({
      revoked_at:null,revoked_by:null,revocation_request_id:null,revision:1,
    });
    const revoked = await db.from("slot_occurrence_exceptions").update({
      revoked_at:revokedAt,revocation_request_id:receipt,revoked_by:teacherId,
    }).eq("id",id).select("revoked_by,revocation_request_id,revision").single();
    expect(revoked.error).toBeNull();
    expect(revoked.data).toEqual({
      revoked_by:teacherId,revocation_request_id:receipt,revision:2,
    });
  } finally {
    expect((await db.auth.admin.deleteUser(teacherId)).error).toBeNull();
  }
});

test("one owner material verification is immutable and remains historical after void", async ()=>{
  const {db,teacherId,studentId,email,password} = await fixture();
  try {
    const signed = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth:{ persistSession:false, autoRefreshToken:false } });
    expect((await signed.auth.signInWithPassword({email,password})).error).toBeNull();
    const material = await db.from("learning_materials").insert({
      teacher_id:teacherId,kind:"external_link",title:"Synthetic verifiable source",
      description:"No external request",source_url:"https://lichess.org/study/abcdef",
      request_id:randomUUID(),request_hash:randomUUID(),
    }).select("id").single();
    expect(material.error).toBeNull();
    const base = {
      teacher_id:teacherId,student_id:studentId,material_id:material.data!.id,
      occurred_on:"2024-03-02",stage:"taught",
    };
    const rows = await signed.from("material_teaching_evidence").insert([
      {...base,request_id:randomUUID()},{...base,request_id:randomUUID()},
    ]).select("id");
    expect(rows.error).toBeNull();
    const [claim,unassessed] = rows.data!;
    const verification = {
      learning_stage:"demonstrated",stage_verified_at:"2024-03-02T12:00:00+00:00",
      stage_verified_by:teacherId,
    };
    const verify = await signed.from("material_teaching_evidence").update(verification)
      .eq("id",claim.id).select("learning_stage,stage_verified_at,stage_verified_by").single();
    expect(verify.error).toBeNull();
    expect(verify.data).toEqual(verification);
    const change = await signed.from("material_teaching_evidence")
      .update({learning_stage:"practiced"}).eq("id",claim.id);
    expect(change.error?.message).toContain("IMMUTABLE_MATERIAL_STAGE_EVIDENCE");
    const voidState = {voided_at:"2024-03-03T14:00:00+00:00",void_reason:"Reviewed correction"};
    const preVoided = await signed.from("material_teaching_evidence")
      .insert({...base,...voidState,...verification,request_id:randomUUID()});
    expect(preVoided.error?.code).toBe("23514");
    expect(preVoided.error?.message).toContain("IMMUTABLE_MATERIAL_STAGE_EVIDENCE");
    const eraseOnVoid = await signed.from("material_teaching_evidence").update({
      ...voidState,learning_stage:null,stage_verified_at:null,stage_verified_by:null,
    }).eq("id",claim.id);
    expect(eraseOnVoid.error?.message).toContain("IMMUTABLE_MATERIAL_STAGE_EVIDENCE");
    const addOnVoid = await signed.from("material_teaching_evidence")
      .update({...voidState,...verification}).eq("id",unassessed.id);
    expect(addOnVoid.error?.message).toContain("IMMUTABLE_MATERIAL_STAGE_EVIDENCE");
    const correct = await signed.from("material_teaching_evidence").update(voidState)
      .eq("id",claim.id).select("learning_stage,stage_verified_at,stage_verified_by,voided_at,void_reason").single();
    expect(correct.error).toBeNull();
    expect(correct.data).toEqual({...verification,...voidState});
    const active = await signed.from("material_teaching_evidence").select("id")
      .eq("student_id",studentId).is("voided_at",null);
    expect(active.error).toBeNull();
    expect(active.data).toEqual([{id:unassessed.id}]);
    const voidUnassessed = await signed.from("material_teaching_evidence").update(voidState)
      .eq("id",unassessed.id);
    expect(voidUnassessed.error).toBeNull();
    const afterVoid = await signed.from("material_teaching_evidence").update(verification)
      .eq("id",unassessed.id);
    expect(afterVoid.error?.message).toContain("INVALID_MATERIAL_VOID");
  } finally {
    expect((await db.from("material_teaching_evidence").delete().eq("teacher_id",teacherId)).error).toBeNull();
    expect((await db.auth.admin.deleteUser(teacherId)).error).toBeNull();
  }
});
