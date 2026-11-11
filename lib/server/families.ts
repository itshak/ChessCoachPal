import type { SupabaseClient } from "@supabase/supabase-js";
import { generateShortToken } from "@/lib/token";

export interface CreateGuardianInput {
  name: string;
  familyName?: string | null;
  email?: string | null;
  phone?: string | null;
  secondaryName?: string | null;
  secondaryEmail?: string | null;
  secondaryPhone?: string | null;
  emailRecipients?: "primary" | "secondary" | "both";
}

export async function insertGuardian(
  supabase: SupabaseClient,
  teacherId: string,
  input: CreateGuardianInput
) {
  const emailRecipients = ["primary", "secondary", "both"].includes(
    input.emailRecipients ?? ""
  )
    ? input.emailRecipients!
    : "primary";

  return supabase
    .from("guardians")
    .insert({
      teacher_id: teacherId,
      name: input.name.trim(),
      family_name: input.familyName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      secondary_name: input.secondaryName?.trim() || null,
      secondary_email: input.secondaryEmail?.trim() || null,
      secondary_phone: input.secondaryPhone?.trim() || null,
      email_recipients: emailRecipients,
      portal_token: generateShortToken(),
    })
    .select()
    .single();
}

export interface CreateStudentInput {
  name: string;
  birthdate?: string | null;
  level?: string | null;
  teacherNotes?: string | null;
  guardianId?: string | null;
  /** Create a singleton family when set (and no guardianId). */
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactName?: string | null;
  /** Family named after the student; contact is the student. */
  adultSelf?: boolean;
  /** Optional cross-client durable create receipt. */
  idempotencyKey?: string;
}

/**
 * Create a student, optionally linking an existing family or auto-creating a
 * singleton "family of one" when contact info / adultSelf is provided.
 */
export async function createStudentWithOptionalFamily(
  supabase: SupabaseClient,
  teacherId: string,
  input: CreateStudentInput
): Promise<
  | { ok: true; student: Record<string, unknown>; createdFamily: boolean }
  | { ok: false; error: string; status: number }
> {
  const name=input.name?.trim();
  if(!name)return {ok:false,error:"Name is required",status:400};
  if(input.idempotencyKey!==undefined&&
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotencyKey))
    return {ok:false,error:"idempotencyKey must be a UUID",status:400};
  // The legacy two-POST create could leave a portal family without its
  // student when a later quota/FK/validation check failed. A single SQL
  // transaction now owns both rows and a durable replay receipt; the
  // hosted active-student trigger protects quota at insert time.
  const {data,error}=await supabase.rpc("ccp_student_create_full",{
    p_name:name,
    p_birthdate:input.birthdate||null,
    p_level:input.level??null,
    p_teacher_notes:input.teacherNotes??null,
    p_guardian_id:input.guardianId||null,
    p_contact_email:input.contactEmail??null,
    p_contact_phone:input.contactPhone??null,
    p_contact_name:input.contactName??null,
    p_adult_self:Boolean(input.adultSelf),
    p_request_id:input.idempotencyKey??null,
  });
  void teacherId;
  if(error){
    const message=error.message??"Student creation failed";
    if(message.includes("HOSTED_LIMIT_REACHED"))
      return {ok:false,error:"Active-student capacity reached",status:403};
    if(message.includes("STUDENT_REQUEST_CONFLICT")||error.code==="23505")
      return {ok:false,error:"Student creation requestId was already used with different details",status:409};
    if(message.includes("STUDENT_ALREADY_DELETED"))
      return {ok:false,error:"Student from this request was permanently deleted",status:409};
    if(message.includes("GUARDIAN_NOT_FOUND"))
      return {ok:false,error:"Family not found",status:404};
    if(/STUDENT_INVALID_INPUT|GUARDIAN_NAME_REQUIRED|GUARDIAN_CONTACT_CHANNEL_REQUIRED/.test(message)||
       ["22023","22007","22008"].includes(error.code??""))
      return {ok:false,error:"Invalid student or family contact details",status:400};
    return {ok:false,error:"Student and optional family could not be created",status:500};
  }
  if(!data||typeof data!=="object"||Array.isArray(data)||
     !data.student||typeof data.student!=="object")
    return {ok:false,error:"Student transaction returned invalid data",status:500};
  return {ok:true,student:data.student as Record<string,unknown>,
    createdFamily:Boolean(data.createdFamily)};
}

/**
 * Delete guardians that have no students and no invoices (RESTRICTed FK).
 * Used after moving the last member out of a singleton family.
 */
export async function retireEmptyGuardians(
  supabase: SupabaseClient,
  teacherId: string,
  guardianIds: string[]
): Promise<{ retired: string[] }> {
  const unique = [...new Set(guardianIds.filter(Boolean))];
  const retired: string[] = [];

  for (const id of unique) {
    const { count: studentCount } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId)
      .eq("guardian_id", id);

    if ((studentCount ?? 0) > 0) continue;

    const { count: invoiceCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId)
      .eq("guardian_id", id);

    if ((invoiceCount ?? 0) > 0) continue;

    const { error } = await supabase
      .from("guardians")
      .delete()
      .eq("id", id)
      .eq("teacher_id", teacherId);

    if (!error) retired.push(id);
  }

  return { retired };
}
