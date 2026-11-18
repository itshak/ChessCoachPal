import { NextRequest, NextResponse } from "next/server";
import { isEventReminderDay } from "@/lib/events";
import { createServiceClient } from "@/lib/supabase/server";
import {
  sendEventEmails,
  loadEventForEmail,
} from "@/lib/server/event-email";
import { requestOrigin } from "@/lib/server/http";
import { DEFAULT_POLICY, type TeacherPolicy } from "@/lib/schedule";
import { secureCompare } from "@/lib/server/secure-compare";
import {deliverCanonicalOutbox} from "@/lib/server/canonical-delivery-outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  return secureCompare(header, `Bearer ${secret}`);
}

function cronOrigin(req: NextRequest): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (site) return site;
  return requestOrigin(req);
}

/**
 * Daily job: email explicitly invited contacts on the teacher-local day
 * before events with send_reminder enabled. Secure with CRON_SECRET
 * (Vercel Cron sends it). Schedule: 14:00 UTC ≈ morning US Central.
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // This existing daily cron also drains approved, crash-retryable teaching
  // notifications on Vercel Hobby (one scheduled trigger per day). Dedicated
  // /api/cron/canonical-outbox supports more frequent operator scheduling.
  try { await deliverCanonicalOutbox(supabase,{limit:30}); }
  catch(e) {
    // Reminders are independent; never lose those because an outbox lease
    // worker failed. The unacknowledged message stays due for retry.
    console.error("Canonical outbox daily drain unavailable",
      e instanceof Error?e.name:"Error");
  }

  const now = new Date();
  const origin = cronOrigin(req);

  const { data: events, error } = await supabase
    .from("events")
    .select("id,teacher_id,starts_at")
    .eq("send_reminder", true)
    .is("reminder_sent_at", null)
    .gt("starts_at", now.toISOString());

  if (error) {
    console.error("event-reminders load:", error);
    return NextResponse.json(
      { error: "Failed to load events" },
      { status: 500 }
    );
  }

  const candidates = events ?? [];
  if (candidates.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, skipped: 0 });
  }

  const teacherIds = Array.from(
    new Set(candidates.map((e) => e.teacher_id as string))
  );

  const [{ data: policies }, { data: teachers }] = await Promise.all([
    supabase
      .from("teacher_settings")
      .select("*")
      .in("teacher_id", teacherIds),
    supabase.from("teachers").select("id, email").in("id", teacherIds),
  ]);

  const policyByTeacher = new Map<string, TeacherPolicy>();
  for (const row of policies ?? []) {
    policyByTeacher.set(row.teacher_id, {
      ...DEFAULT_POLICY,
      ...row,
    } as TeacherPolicy);
  }
  const emailByTeacher = new Map(
    (teachers ?? []).map((t) => [t.id as string, t.email as string])
  );

  let processed = 0;
  let sentTotal = 0;
  let skippedTotal = 0;

  for (const event of candidates) {
    const teacherId = event.teacher_id as string;
    const policy =
      policyByTeacher.get(teacherId) ?? ({ ...DEFAULT_POLICY } as TeacherPolicy);

    if (!isEventReminderDay(event.starts_at, policy.timezone, now)) {
      continue;
    }

    const emailEvent=await loadEventForEmail(supabase,event.id,teacherId);
    if(!emailEvent){continue;}

    const { sent, skipped } = await sendEventEmails({
      db:supabase,
      teacherId,
      event: emailEvent,
      policy,
      teacherEmail: emailByTeacher.get(teacherId) ?? null,
      origin,
      mode: "reminder",
    });

    const { error: markError } = await supabase
      .from("events")
      .update({ reminder_sent_at: now.toISOString() })
      .eq("id", event.id);

    if (markError) {
      console.error("event-reminders mark sent:", event.id, markError);
    }

    processed += 1;
    sentTotal += sent;
    skippedTotal += skipped;
  }

  return NextResponse.json({
    processed,
    sent: sentTotal,
    skipped: skippedTotal,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
