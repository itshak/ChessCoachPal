import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DailyCloseError } from "@/lib/server/daily-lesson-close";
import {
  dailyCombinedCommitInput, dailyCombinedPreviewInput,
  teacherDailyCombinedCommit, teacherDailyCombinedPreview,
} from "@/lib/server/daily-lesson-combined";

const headers = { "Cache-Control": "private, no-store" };
const invalid = () => NextResponse.json(
  { code: "VALIDATION_ERROR", error: "Invalid reviewed lesson completion" }, { status: 400, headers },
);

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid();
  const { action, ...input } = body as Record<string, unknown>;
  try {
    if (action === "preview") {
      const parsed = dailyCombinedPreviewInput.safeParse(input);
      if (!parsed.success) return invalid();
      return NextResponse.json(await teacherDailyCombinedPreview(db, user.id, parsed.data), { headers });
    }
    if (action === "commit") {
      const parsed = dailyCombinedCommitInput.safeParse(input);
      if (!parsed.success) return invalid();
      return NextResponse.json(await teacherDailyCombinedCommit(db, parsed.data), { headers });
    }
    return invalid();
  } catch (error) {
    return NextResponse.json({
      code: error instanceof DailyCloseError ? error.code : "DATABASE_ERROR",
      error: error instanceof DailyCloseError ? error.message : "Unable to verify exact lesson completion",
    }, { status: error instanceof DailyCloseError ? error.status : 503, headers });
  }
}
