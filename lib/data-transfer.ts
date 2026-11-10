import type { SupabaseClient } from "@supabase/supabase-js";
import {generateShortToken} from "@/lib/token";

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
const TEACHER_SCOPED_SET = new Set<string>(TEACHER_SCOPED);

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

function withTeacherId(rows: Record<string, unknown>[], teacherId: string) {
  return rows.map(row => ({ ...row, teacher_id: teacherId }));
}

async function upsertAll(
  supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]
): Promise<string | null> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 200));
    if (error) return `${table}: ${error.message}`;
  }
  return null;
}

/**
 * Only restores the explicitly allowed chess/teacher tables; unknown tables
 * cannot be injected by a malicious export. Cross-owner IDs remain subject
 * to RLS and tenant-ownership foreign-key constraints.
 */
export async function importStudioExport(
  supabase: SupabaseClient, teacherId: string, payload: StudioDataExport
): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }> {
  // Validate the entire allowlisted backup before the first upsert. Without
  // this, malformed rows in a later table could crash after earlier writes.
  if (!parseExportPayload(payload)) {
    return { ok: false, error: "Unsupported ChessCoachPal export format or invalid table shape" };
  }
  const counts: Record<string, number> = {};
  for (const table of IMPORT_ORDER) {
    const source = payload.tables[table];
    const rows = table === "studio_policies"
      ? source && !Array.isArray(source) ? [source as Record<string, unknown>] : []
      : asRows(source);
    const safe = TEACHER_SCOPED_SET.has(table) || table === "studio_policies"
      ? withTeacherId(rows, teacherId)
      : rows;
    if (table === "studio_policies") {
      for (const row of safe) for (const field of POLICY_SECRET_FIELDS) delete (row as Record<string, unknown>)[field];
    }
    // A model-visible portable export deliberately omits portal credentials.
    // On import, generate fresh random links for guardians whose tokens were
    // withheld rather than writing NULL or accepting a predictable placeholder.
    if (table === "guardians") {
      for (const original of safe) {
        const row = original as Record<string, unknown>;
        if (typeof row.portal_token !== "string" || !row.portal_token.trim())
          row.portal_token = generateShortToken();
      }
    }
    const error = await upsertAll(supabase, table, safe);
    if (error) return { ok: false, error };
    counts[table] = rows.length;
  }

  const importedName = payload.teacher_profile?.display_name?.trim();
  if (importedName) {
    const { data: profile } = await supabase.from("teachers").select("display_name").eq("id", teacherId).maybeSingle();
    if (profile && !profile.display_name?.trim()) {
      const { error } = await supabase.from("teachers").update({ display_name: importedName }).eq("id", teacherId);
      if (error) return { ok: false, error: `teacher_profile: ${error.message}` };
      counts.teacher_profile = 1;
    }
  }
  return { ok: true, counts };
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
