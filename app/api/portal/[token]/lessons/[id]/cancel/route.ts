import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getPolicy } from "@/lib/server/scheduling";
import { createTeacherNotification } from "@/lib/server/notifications";
import { formatLessonDate, formatLessonTime } from "@/lib/schedule";
import { requestOrigin } from "@/lib/server/http";

const cancelSchema = z.object({
  note: z.string().max(1000).optional(),
}).strict();
type PortalCancelReceipt = {
  ok: boolean;
  replayed: boolean;
  noticeAt: string;
  cancelNote: string;
  teacherId: string;
  studentName: string;
  startsAt: string;
};

/**
 * Guardian-originated cancellation. Only the server-side token-authorized SQL
 * transaction decides whether attendance can change. Never perform a separate
 * service-role lookup followed by an attendance upsert: that races both teacher
 * edits and a revoked portal token.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const parsed = cancelSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A cancellation note must be at most 1000 characters" },
      { status: 400 }
    );
  }
  const db = createServiceClient();
  const { data, error } = await db.rpc("ccp_portal_cancel_lesson", {
    p_portal_token: token,
    p_lesson_id: id,
    p_cancel_note: parsed.data.note?.trim() ?? "",
  });
  if (error) {
    // Do not return SQL diagnostics, lesson details or bearer capabilities to
    // an anonymous portal caller.
    if (error.message.includes("PORTAL_NOT_FOUND"))
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error.message.includes("PORTAL_ALREADY_MARKED"))
      return NextResponse.json({ error: "Lesson already has an attendance decision" }, { status: 409 });
    if (error.message.includes("PORTAL_TOO_LATE"))
      return NextResponse.json({ error: "Only upcoming lessons can be cancelled" }, { status: 400 });
    if (error.message.includes("PORTAL_INVALID_NOTE"))
      return NextResponse.json({ error: "Invalid cancellation note" }, { status: 400 });
    console.error("Portal cancellation transaction failed:", error.code);
    return NextResponse.json({ error: "Cancellation unavailable" }, { status: 503 });
  }
  const receipt = data as PortalCancelReceipt | null;
  if (!receipt?.ok || !receipt.noticeAt || !receipt.teacherId || !receipt.startsAt) {
    return NextResponse.json({ error: "Cancellation unavailable" }, { status: 503 });
  }

  // A successful replay reads the original attendance timestamp. It must NOT
  // trigger a second bell, push or email. Full crash-safe provider delivery
  // remains a separate durable-outbox acceptance task.
  if (!receipt.replayed) {
    try {
      const policy = await getPolicy(db, receipt.teacherId);
      const when = formatLessonDate(receipt.startsAt, policy.timezone, "long") +
        " at " + formatLessonTime(receipt.startsAt, policy.timezone);
      await createTeacherNotification(db, {
        teacherId: receipt.teacherId,
        type: "portal_cancel",
        title: receipt.studentName + "'s lesson cancelled",
        body: [
          receipt.studentName + " — " + when,
          receipt.cancelNote ? "Note: " + receipt.cancelNote : null,
        ].filter(Boolean).join("\n"),
        href: "/schedule",
        origin: requestOrigin(req),
        policy,
      });
    } catch {
      // Preserve a committed cancellation even when external notification
      // delivery is unavailable; never retry the attendance mutation.
      console.error("Portal cancellation notice delivery unavailable");
    }
  }
  return NextResponse.json({
    ok: true, noticeAt: receipt.noticeAt, replayed: receipt.replayed,
  });
}
