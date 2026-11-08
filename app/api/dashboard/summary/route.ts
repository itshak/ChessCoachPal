import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { teacherDashboardSummary, TeacherOverviewError } from "@/lib/server/teacher-overview-service";

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await teacherDashboardSummary(db, user.id));
  } catch (error) {
    return NextResponse.json({ error: "Dashboard unavailable" }, {
      status: error instanceof TeacherOverviewError ? error.status : 500,
    });
  }
}
