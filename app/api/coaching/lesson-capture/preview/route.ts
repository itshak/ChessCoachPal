import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  lessonCapturePreviewSchema, teacherLessonCapturePreview, LessonCapturePreviewError,
} from "@/lib/server/lesson-capture-preview";

/** Website and delegated MCP run the same owner-scoped, side-effect-free preview. */
export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = lessonCapturePreviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid lesson preview", code: "VALIDATION_ERROR" },
      { status: 400 });

  try {
    const result = await teacherLessonCapturePreview(db, user.id, parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    return NextResponse.json({
      error: caught instanceof LessonCapturePreviewError ? caught.message : "Lesson preview unavailable",
      code: caught instanceof LessonCapturePreviewError ? caught.code : "DATABASE_ERROR",
    }, { status: caught instanceof LessonCapturePreviewError ? caught.status : 500 });
  }
}
