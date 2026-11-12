import type { SupabaseClient } from "@supabase/supabase-js";
import { computeOccurrences, isDateString, type SlotRow } from "@/lib/schedule";
import { getPolicy } from "@/lib/server/scheduling";

type Db = SupabaseClient;
export type CanonicalSlot = SlotRow & { workplace_id?: string | null };
export type CalendarWorkplace = { id: string; timezone: string };
export type PlannedCanonicalOccurrence = {
  teacher_id: string;
  workplace_id: string;
  student_id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  status: "scheduled";
  slot_id: string;
  slot_occurrence_date: string;
  local_timezone: string;
  is_home_visit: boolean;
};

/**
 * Only scheduling intent is expanded. Occurrence identity is the original
 * (slot_id, slot_occurrence_date) pair, not the mutable UTC start instant.
 * A later movement must retain this pair to prevent duplicate lessons.
 */
export function planCanonicalOccurrences(
  teacherId: string,
  slots: readonly CanonicalSlot[],
  workplaces: readonly CalendarWorkplace[],
  fallbackWorkplaceId: string,
  fallbackTimezone: string,
  from: string,
  to: string,
): PlannedCanonicalOccurrence[] {
  if (!isDateString(from) || !isDateString(to) || from > to)
    throw new RangeError("Invalid canonical materialization date range");
  const span = (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000;
  if (span > 366) throw new RangeError("Materialization must cover at most one year");
  const workById = new Map(workplaces.map(w => [w.id, w]));
  if (!workById.has(fallbackWorkplaceId))
    throw new Error("Teacher personal workplace is unavailable");

  const result: PlannedCanonicalOccurrence[] = [];
  const occupied = new Set<string>();
  for (const slot of slots) {
    if (slot.teacher_id !== teacherId) throw new Error("Cross-tenant calendar slot rejected");
    if (slot.duration_minutes < 15 || slot.duration_minutes > 480)
      throw new Error("Canonical lessons must last 15–480 minutes");
    const workplaceId = slot.workplace_id ?? fallbackWorkplaceId;
    const workplace = workById.get(workplaceId);
    if (!workplace) throw new Error("Unrecognized teacher workplace on recurring slot");
    const timezone = slot.workplace_id ? workplace.timezone : fallbackTimezone;
    for (const occurrence of computeOccurrences(slot, from, to, timezone)) {
      const key = slot.id + ":" + occurrence.lesson_date;
      if (occupied.has(key)) throw new Error("Duplicate slot/date in source inventory");
      occupied.add(key);
      result.push({
        teacher_id: teacherId,
        workplace_id: workplaceId,
        student_id: slot.student_id,
        title: "Private chess lesson",
        starts_at: occurrence.starts_at,
        duration_minutes: occurrence.duration_minutes,
        status: "scheduled",
        slot_id: slot.id,
        slot_occurrence_date: occurrence.lesson_date,
        local_timezone: timezone,
        is_home_visit: occurrence.is_home_visit,
      });
      if (result.length > 5000) throw new RangeError("Too many occurrences to materialize safely");
    }
  }
  return result;
}

/** Initial canonical materialization. Conflict=ignore is intentional: never
 * overwrite a session with attendance, notes, a moved start or paid credits.
 * This will replace the legacy calendar materializer after all consumers are
 * rewired. Full slot edit/delete reconciliation remains SQL-transaction work.
 */
export async function materializeCanonicalSessions(
  db: Db, teacherId: string, from: string, to: string,
): Promise<{ planned: number }> {
  const policy = await getPolicy(db, teacherId);
  const workplaces: CalendarWorkplace[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("workplaces")
      .select("id,timezone").eq("teacher_id", teacherId)
      .order("created_at").order("id").range(offset, offset + 499);
    if (error) throw new Error("Unable to read teacher workplaces");
    workplaces.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
    if (workplaces.length > 20000) throw new RangeError("Workplace inventory too large");
  }
  const personal = workplaces[0]?.id;
  if (!personal) throw new Error("Teacher personal workplace is unavailable");
  const slots: CanonicalSlot[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("lesson_slots")
      .select("*").eq("teacher_id", teacherId).eq("active", true)
      .order("id").range(offset, offset + 499);
    if (error) throw new Error("Unable to read recurring slots");
    slots.push(...((data ?? []) as CanonicalSlot[]));
    if ((data?.length ?? 0) < 500) break;
    if (slots.length > 20000) throw new RangeError("Recurring slot inventory too large");
  }
  const planned = planCanonicalOccurrences(
    teacherId, slots, workplaces, personal, policy.timezone, from, to,
  );
  // The owner-scoped SQL command validates all slot dates, workplace
  // ownership and local times before committing any row. Batches are bounded
  // to avoid PostgREST row and request-size limits; each batch is atomic.
  for (let i = 0; i < planned.length; i += 100) {
    const { error } = await db.rpc("ccp_canonical_slot_materialize", {
      p_rows: planned.slice(i, i + 100),
    });
    if (error) throw new Error("Unable to materialize canonical recurring lessons");
  }
  return { planned: planned.length };
}
