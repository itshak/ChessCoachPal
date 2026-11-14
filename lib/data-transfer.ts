import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Only one current ChessCoachPal teacher-data backup shape; no prior-format
 * adapters or version negotiation. OAuth credentials, payment secrets and
 * binary objects are excluded from portable exports.
 */
export type StudioDataExport = {
  exportedAt: string;
  teacherId: string;
  teacher_profile?: { display_name?: string } | null;
  tables: Record<string, Record<string, unknown>[] | Record<string, unknown> | null>;
};

const POLICY_SECRET_FIELDS = [
  "stripe_secret_key", "stripe_publishable_key", "stripe_webhook_secret", "ai_api_key",
] as const;

/** Order respects FK dependencies when imported into a different teacher. */
const IMPORT_ORDER = [
  "studio_policies", "guardians", "students", "workplaces", "class_groups",
  "workplace_enrollments", "group_enrollments", "lesson_slots",
  "teaching_sessions", "session_participants", "session_attendance",
  "session_notes", "chess_skill_categories", "chess_observations",
  "skill_dimensions", "skill_assessments",
  "invoices", "invoice_items", "payments", "events", "event_students",
  "event_rsvps", "credit_packages", "credit_redemptions",
  // Canonical chess catalog and student-first learning history. Restore order
  // respects material root/subtypes → relations → homework/reviews → plans.
  "learning_materials", "chess_games", "chess_puzzles", "chess_drills",
  "chess_study_chapters", "learning_material_relations",
  "material_links", "material_teaching_evidence", "training_assignments", "assignment_attempts", "assignment_reviews",
  "student_training_plans", "student_training_plan_revisions",
] as const;

const TEACHER_SCOPED = [
  "guardians", "students", "workplaces", "class_groups",
  "workplace_enrollments", "group_enrollments", "lesson_slots",
  "teaching_sessions", "session_participants", "session_attendance",
  "session_notes", "chess_skill_categories", "chess_observations",
  "skill_dimensions", "invoices", "events", "credit_packages", "credit_redemptions",
  "learning_materials", "chess_games", "chess_puzzles", "chess_drills",
  "chess_study_chapters", "learning_material_relations",
  "material_links", "material_teaching_evidence", "training_assignments", "assignment_attempts", "assignment_reviews",
  "student_training_plans", "student_training_plan_revisions",
] as const;

function asRows(data: unknown): Record<string, unknown>[] {
  return (data as Record<string, unknown>[] | null) ?? [];
}
function ids(rows: Record<string, unknown>[]): string[] {
  return rows.map(row => row.id).filter((id): id is string => typeof id === "string");
}
/**
 * PostgREST ordinarily caps query results to 1000 rows. Backups must not
 * silently truncate later students, history or financial records.
 * A bounded deterministic scan returns all pages, or fails explicitly rather
 * than offering a deceptively "successful" incomplete backup.
 */
export const EXPORT_PAGE_SIZE=500;
export const EXPORT_MAX_ROWS_PER_TABLE=20_000;
type ExportPage={data:unknown;error:{message:string}|null};
async function readExportPages(
  label:string,fetchPage:(start:number,end:number)=>Promise<ExportPage>
):Promise<Record<string,unknown>[]> {
  const all:Record<string,unknown>[]=[];
  for(let offset=0;;offset+=EXPORT_PAGE_SIZE){
    const {data,error}=await fetchPage(offset,offset+EXPORT_PAGE_SIZE-1);
    if(error)throw new Error(`Export ${label}: ${error.message}`);
    if(data!==null&&!Array.isArray(data))
      throw new Error(`Export ${label}: unexpected database response`);
    const batch=asRows(data);
    if(batch.length>EXPORT_PAGE_SIZE)
      throw new Error(`Export ${label}: invalid page size`);
    if(all.length+batch.length>EXPORT_MAX_ROWS_PER_TABLE)
      throw new Error(`Export ${label}: exceeds safe export row limit; contact support for a dedicated backup`);
    all.push(...batch);
    if(batch.length<EXPORT_PAGE_SIZE)break;
  }
  return all;
}
function policyWithoutSecrets(
  policy: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!policy) return null;
  const sanitized = { ...policy };
  for (const field of POLICY_SECRET_FIELDS) sanitized[field] = null;
  return sanitized;
}

export async function buildStudioExport(
  supabase: SupabaseClient,
  teacherId: string
): Promise<StudioDataExport> {
  const tables: StudioDataExport["tables"] = {};
  const policy = await supabase.from("studio_policies").select("*").eq("teacher_id", teacherId).maybeSingle();
  if (policy.error) throw new Error(`Export studio_policies: ${policy.error.message}`);
  tables.studio_policies = policyWithoutSecrets(policy.data as Record<string, unknown> | null);

  for (const table of TEACHER_SCOPED) {
    tables[table]=await readExportPages(table,async(start,end)=>{
      const query=supabase.from(table).select("*").eq("teacher_id",teacherId);
      // A few roster relations have composite keys rather than an id.
      // Not every composite-keyed evidence table has an "id" column.
      // Deterministic key order ensures multi-page exports cannot repeat or
      // silently skip records after PostgREST's 1000-row limit.
      const keyOrders:Partial<Record<typeof table,readonly string[]>>={
        session_participants:["session_id","student_id"],
        group_enrollments:["group_id","student_id"],
        chess_games:["material_id"],chess_puzzles:["material_id"],
        chess_drills:["material_id"],chess_study_chapters:["material_id"],
        learning_material_relations:["from_material_id","to_material_id","relation_type"],
        student_training_plan_revisions:["plan_id","revision"],
      };
      const orderKeys=keyOrders[table]??["id"];
      const ordered=orderKeys.reduce((q,key)=>q.order(key),query);
      const {data,error}=await ordered.range(start,end);
      return {data,error};
    });
  }

  async function children(table: string, fk: string, parents: string[]) {
    if (!parents.length) { tables[table] = []; return; }
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; start < parents.length; start += 200) {
      const parentIds=parents.slice(start,start+200);
      const page=await readExportPages(table,async(from,to)=>{
        const {data,error}=await supabase.from(table).select("*")
          .in(fk,parentIds).order("id").range(from,to);
        return {data,error};
      });
      if(rows.length+page.length>EXPORT_MAX_ROWS_PER_TABLE)
        throw new Error(`Export ${table}: exceeds safe export row limit; contact support for a dedicated backup`);
      rows.push(...page);
    }
    tables[table] = rows;
  }

  await children("skill_assessments", "student_id", ids(asRows(tables.students)));
  await children("invoice_items", "invoice_id", ids(asRows(tables.invoices)));
  await children("payments", "invoice_id", ids(asRows(tables.invoices)));
  await children("event_students", "event_id", ids(asRows(tables.events)));
  await children("event_rsvps", "event_id", ids(asRows(tables.events)));

  const { data: profile, error: profileError } = await supabase
    .from("teachers").select("display_name").eq("id", teacherId).maybeSingle();
  if (profileError) throw new Error(`Export profile: ${profileError.message}`);

  return {
    exportedAt: new Date().toISOString(),
    teacherId,
    teacher_profile: profile ? { display_name: profile.display_name ?? "" } : null,
    tables,
  };
}

/**
 * A reviewed backup is applied by a single authenticated Postgres function.
 * One failure must never leave half of a student's teaching history restored.
 * The SQL function enforces RLS, tenant-scoped owners, FK order, hosted quotas,
 * and an atomic SHA-256 keyed replay receipt for cross-client retries.
 */
export async function importStudioExport(
  supabase: SupabaseClient, teacherId: string, payload: StudioDataExport, sha256: string
): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }> {
  if (!parseExportPayload(payload))
    return {ok:false,error:"Unsupported ChessCoachPal export format or invalid table shape"};
  // The invoker's auth.uid() is authoritative inside the RPC; never pass a
  // writable teacher_id argument that an MCP or website client could spoof.
  if (!teacherId) return {ok:false,error:"Authenticated teacher is required"};
  // Validate the exact current table allowlist before any database writes.
  const safeTables:StudioDataExport["tables"]={};
  for (const table of IMPORT_ORDER) {
    const source=payload.tables[table];
    if (source===undefined) continue;
    if (table==="studio_policies" && source && !Array.isArray(source)) {
      const sanitized={...source};
      for(const field of POLICY_SECRET_FIELDS) delete sanitized[field];
      safeTables[table]=sanitized;
    } else safeTables[table]=source;
  }
  const { data, error } = await supabase.rpc("ccp_teacher_backup_restore", {
    p_tables:safeTables,
    p_display_name:payload.teacher_profile?.display_name ?? null,
    p_digest:sha256,
  });
  if (error) return {ok:false,error:error.message};
  const counts=(data as {counts?:Record<string,number>}|null)?.counts;
  if (!counts || typeof counts!=="object" || Array.isArray(counts))
    return {ok:false,error:"Restore completed without a valid transaction receipt"};
  return {ok:true,counts};
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Accept the current schema only; a foreign table or unknown top-level
 * property is a validation failure, not an excuse for translation. */
export function parseExportPayload(raw: unknown): StudioDataExport | null {
  if (!isRecord(raw) || !isRecord(raw.tables) ||
      typeof raw.exportedAt !== "string" || !Number.isFinite(Date.parse(raw.exportedAt)) ||
      typeof raw.teacherId !== "string" || raw.teacherId.length===0) return null;
  const rootKeys=new Set(["exportedAt","teacherId","teacher_profile","tables"]);
  if(Object.keys(raw).some(key=>!rootKeys.has(key))) return null;
  const tables=raw.tables;
  const allowedTables=new Set<string>(IMPORT_ORDER);
  if(Object.keys(tables).some(table=>!allowedTables.has(table))) return null;
  for (const table of IMPORT_ORDER) {
    const source = tables[table];
    if (source === undefined) continue;
    if (table === "studio_policies") {
      if (source !== null && !isRecord(source)) return null;
    } else if (!Array.isArray(source) || !source.every(isRecord)) {
      return null;
    }
  }
  if (raw.teacher_profile != null &&
      (!isRecord(raw.teacher_profile) ||
       (raw.teacher_profile.display_name !== undefined &&
        typeof raw.teacher_profile.display_name !== "string"))) return null;
  return raw as StudioDataExport;
}
