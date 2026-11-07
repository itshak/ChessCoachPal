import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DATA_EXPORT_VERSION, parseExportPayload, importStudioExport,
  type StudioDataExport,
} from "@/lib/data-transfer";

function payloadWithVersion(version: number): StudioDataExport {
  return {
    version,
    exportedAt: new Date().toISOString(),
    teacherId: "00000000-0000-0000-0000-000000000001",
    tables: { studio_policies: null, guardians: [], students: [] },
  };
}

function stubSupabase(upserts: Record<string, unknown[]>): SupabaseClient {
  return {
    from(table: string) {
      return {
        upsert(rows: unknown[]) {
          upserts[table] = [...(upserts[table] ?? []), ...rows];
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => Promise.resolve({ data: { display_name: "Existing name" } }),
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("ChessCoachPal portable backup", () => {
  it("accepts only the current pre-1.0 chess-only format", () => {
    expect(DATA_EXPORT_VERSION).toBe(1);
    expect(parseExportPayload(payloadWithVersion(DATA_EXPORT_VERSION))).not.toBeNull();
    expect(parseExportPayload(payloadWithVersion(2))).toBeNull();
    expect(parseExportPayload({ version: DATA_EXPORT_VERSION })).toBeNull();
  });

  it("imports coaching records and rewrites teacher ownership", async () => {
    const teacherId = "00000000-0000-0000-0000-000000000002";
    const upserts: Record<string, unknown[]> = {};
    const payload = payloadWithVersion(DATA_EXPORT_VERSION);
    payload.tables.students = [{ id: "s1", name: "Ada", teacher_id: "old" }];
    payload.tables.workplaces = [{ id: "w1", name: "Chess club", teacher_id: "old" }];
    payload.tables.teaching_sessions = [{ id: "t1", title: "Endgames", teacher_id: "old" }];
    payload.tables.chess_observations = [{ id: "c1", observation: "Knows the opposition", teacher_id: "old" }];
    payload.tables.events = [{ id: "e1", title: "Chess tournament", teacher_id: "old" }];
    payload.tables.event_students = [{ id: "es1", event_id: "e1" }];

    const result = await importStudioExport(stubSupabase(upserts), teacherId, payload);
    expect(result.ok).toBe(true);
    for (const table of ["students", "workplaces", "teaching_sessions", "chess_observations", "events"]) {
      expect(upserts[table]?.[0]).toHaveProperty("teacher_id", teacherId);
    }
    expect(upserts.event_students).toHaveLength(1);
  });

  it("never writes removed music tables or provider secrets", async () => {
    const teacherId = "00000000-0000-0000-0000-000000000002";
    const upserts: Record<string, unknown[]> = {};
    const payload = payloadWithVersion(DATA_EXPORT_VERSION);
    payload.tables.plans = [{ id: "malicious" }];
    payload.tables.sheet_music_assignments = [{ id: "malicious" }];
    payload.tables.studio_policies = {
      id: "p1", ai_api_key: "secret", stripe_secret_key: "secret",
    };
    const result = await importStudioExport(stubSupabase(upserts), teacherId, payload);
    expect(result.ok).toBe(true);
    expect(upserts.plans).toBeUndefined();
    expect(upserts.sheet_music_assignments).toBeUndefined();
    expect(upserts.studio_policies?.[0]).not.toHaveProperty("ai_api_key");
    expect(upserts.studio_policies?.[0]).not.toHaveProperty("stripe_secret_key");
  });

  it("rejects unsupported versions before writing any data", async () => {
    const upserts: Record<string, unknown[]> = {};
    const result = await importStudioExport(stubSupabase(upserts), "teacher", payloadWithVersion(99));
    expect(result.ok).toBe(false);
    expect(upserts).toEqual({});
  });
});
