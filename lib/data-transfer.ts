import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ChessCoachPal pre-1.0 backup format. No CogNote/music import compatibility.
 * OAuth grants, access tokens, provider secrets, Stripe identifiers and
 * uploaded binary objects are deliberately excluded from portable exports.
 */
export const DATA_EXPORT_VERSION = 1 as const;
export type StudioDataExport = {
  version: number;
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
  "workplace_enrollments", "group_enrollments", "teaching_sessions",
  "session_participants", "session_attendance", "chess_skill_categories",
  "chess_observations", "chess_learning_resources", "lesson_slots", "lessons",
  "attendance", "lesson_notes", "skill_dimensions", "skill_assessments",
  "invoices", "invoice_items", "payments", "events", "event_students",
  "event_rsvps", "credit_packages", "credit_redemptions",
] as const;

const TEACHER_SCOPED = [
  "guardians", "students", "workplaces", "class_groups",
  "workplace_enrollments", "group_enrollments", "teaching_sessions",
  "session_participants", "session_attendance", "chess_skill_categories",
  "chess_observations", "chess_learning_resources", "lesson_slots", "lessons",
  "skill_dimensions", "invoices", "events", "credit_packages", "credit_redemptions",
] as const;

function asRows(data: unknown): Record<string, unknown>[] {
  return (data as Record<string, unknown>[] | null) ?? [];
}
function ids(rows: Record<string, unknown>[]): string[] {
  return rows.map(row => row.id).filter((id): id is string => typeof id === "string");
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
    const { data, error } = await supabase.from(table).select("*").eq("teacher_id", teacherId);
    if (error) throw new Error(`Export ${table}: ${error.message}`);
    tables[table] = asRows(data);
  }

  async function children(table: string, fk: string, parents: string[]) {
    if (!parents.length) { tables[table] = []; return; }
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; start < parents.length; start += 200) {
      const { data, error } = await supabase.from(table).select("*").in(fk, parents.slice(start, start + 200));
      if (error) throw new Error(`Export ${table}: ${error.message}`);
      rows.push(...asRows(data));
    }
    tables[table] = rows;
  }

  await children("attendance", "lesson_id", ids(asRows(tables.lessons)));
  await children("lesson_notes", "lesson_id", ids(asRows(tables.lessons)));
  await children("skill_assessments", "student_id", ids(asRows(tables.students)));
  await children("invoice_items", "invoice_id", ids(asRows(tables.invoices)));
  await children("payments", "invoice_id", ids(asRows(tables.invoices)));
  await children("event_students", "event_id", ids(asRows(tables.events)));
  await children("event_rsvps", "event_id", ids(asRows(tables.events)));

  const { data: profile, error: profileError } = await supabase
    .from("teachers").select("display_name").eq("id", teacherId).maybeSingle();
  if (profileError) throw new Error(`Export profile: ${profileError.message}`);

  return {
    version: DATA_EXPORT_VERSION,
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
  // Strip unknown/deprecated tables and policy credentials before the RPC
  // request itself; the database separately enforces the same allowlist.
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

/** Check every restorable table before any writes. Unknown tables remain ignored
 * (never restored), including old non-chess tables. Absent tables are allowed
 * for intentionally minimal exports. */
export function parseExportPayload(raw: unknown): StudioDataExport | null {
  if (!isRecord(raw) || raw.version !== DATA_EXPORT_VERSION || !isRecord(raw.tables))
    return null;
  const tables = raw.tables;
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
