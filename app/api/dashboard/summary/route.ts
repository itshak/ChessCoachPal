import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { teacherDashboardSummary, teacherDashboardSummaryInput, TeacherOverviewError } from "@/lib/server/teacher-overview-service";
import { WorkplaceContextError } from "@/lib/server/teacher-workplace-context";

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const values = params.getAll("workplaceId");
  const dates = params.getAll("date");
  const input = teacherDashboardSummaryInput.safeParse({
    workplaceId: values[0] === "all" ? null : values[0],
    date: dates[0],
  });
  if (values.length > 1 || dates.length > 1 || !input.success)
    return NextResponse.json({ error: dates.length ? "Invalid dashboard filters" : "Invalid workplace filter", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    return NextResponse.json(await teacherDashboardSummary(db, user.id, input.data.workplaceId, input.data.date));
  } catch (error) {
    if (error instanceof WorkplaceContextError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Dashboard unavailable" }, {
      status: error instanceof TeacherOverviewError ? error.status : 500,
    });
  }
}
