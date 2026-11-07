import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: studentCount }, { count: workplaceCount }, { count: groupCount }, { count: sessionsThisWeek }] = await Promise.all([
    supabase.from("students").select("id", { count: "exact", head: true }).eq("teacher_id", user.id).is("archived_at", null),
    supabase.from("workplaces").select("id", { count: "exact", head: true }).eq("teacher_id", user.id),
    supabase.from("class_groups").select("id", { count: "exact", head: true }).eq("teacher_id", user.id),
    supabase.from("teaching_sessions").select("id", { count: "exact", head: true })
      .eq("teacher_id", user.id).gte("starts_at", weekAgo),
  ]);
  return NextResponse.json({
    studentCount: studentCount ?? 0,
    workplaceCount: workplaceCount ?? 0,
    groupCount: groupCount ?? 0,
    sessionsThisWeek: sessionsThisWeek ?? 0,
  });
}
