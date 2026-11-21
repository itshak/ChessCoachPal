import type {SupabaseClient} from "@supabase/supabase-js";

export interface CreateStudentInput {
  name: string;
  birthdate?: string | null;
  level?: string | null;
  teacherNotes?: string | null;
  /** An independent teacher-owned contact; never grants a portal token. */
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactName?: string | null;
  /** Contact identity is the student; no implied portal or payer role. */
  adultSelf?: boolean;
  /** Create former students without temporarily consuming active quota. */
  archived?: boolean;
  /** Optional cross-client durable create receipt. */
  idempotencyKey?: string;
}

/**
 * Create a student with optional new independent contact. Zero contacts are
 * valid; a linked contact is NEVER automatically a portal viewer or payer.
 */
export async function createStudentWithOptionalContact(
  supabase: SupabaseClient,
  teacherId: string,
  input: CreateStudentInput
): Promise<
  | { ok: true; student: Record<string, unknown>; createdContactId: string | null }
  | { ok: false; error: string; status: number }
> {
  const name=input.name?.trim();
  if(!name)return {ok:false,error:"Name is required",status:400};
  if(input.idempotencyKey!==undefined&&
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotencyKey))
    return {ok:false,error:"idempotencyKey must be a UUID",status:400};
  // Student, independent contact and student-contact association are one
  // transaction plus a durable replay receipt. The hosted student-capacity
  // trigger protects quota, and a failed write rolls back all created rows.
  const {data,error}=await supabase.rpc("ccp_student_create_full",{
    p_name:name,
    p_birthdate:input.birthdate||null,
    p_level:input.level??null,
    p_teacher_notes:input.teacherNotes??null,
    p_contact_email:input.contactEmail??null,
    p_contact_phone:input.contactPhone??null,
    p_contact_name:input.contactName??null,
    p_adult_self:Boolean(input.adultSelf),
    p_archived:Boolean(input.archived),
    p_request_id:input.idempotencyKey??null,
  });
  void teacherId;
  if(error){
    const message=error.message??"Student creation failed";
    if(/CAPACITY_EXCEEDED|HOSTED_LIMIT_REACHED/.test(message))
      return {ok:false,error:"Active-student capacity reached",status:403};
    if(message.includes("STUDENT_REQUEST_CONFLICT")||error.code==="23505")
      return {ok:false,error:"Student creation requestId was already used with different details",status:409};
    if(message.includes("STUDENT_ALREADY_DELETED"))
      return {ok:false,error:"Student from this request was permanently deleted",status:409};
    if(/STUDENT_INVALID_INPUT|CONTACT_NAME_REQUIRED/.test(message)||
       ["22023","22007","22008"].includes(error.code??""))
      return {ok:false,error:"Invalid student or independent contact details",status:400};
    return {ok:false,error:"Student or optional contact could not be created",status:500};
  }
  if(!data||typeof data!=="object"||Array.isArray(data)||
     !data.student||typeof data.student!=="object")
    return {ok:false,error:"Student transaction returned invalid data",status:500};
  return {ok:true,student:data.student as Record<string,unknown>,
    createdContactId:typeof data.createdContactId==="string"?data.createdContactId:null};
}
