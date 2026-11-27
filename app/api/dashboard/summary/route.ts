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
  const cursors = params.getAll("homeworkAfter");
  const upcoming = params.getAll("upcomingAfter");
  const reviews = params.getAll("closeReview");
  const freshness = params.getAll("ratingFreshness");
  const input = teacherDashboardSummaryInput.safeParse({
    workplaceId: values[0] === "all" ? null : values[0],
    date: dates[0],
    homeworkAfter: cursors[0],
    upcomingAfter: upcoming[0],
    closeReview: reviews.length ? reviews[0] === "1" : undefined,
    ratingFreshness: freshness.length ? freshness[0] === "1" : undefined,
  });
  if (values.length > 1 || dates.length > 1 || cursors.length > 1 || upcoming.length > 1 || reviews.length > 1 || freshness.length > 1 || !input.success)
    return NextResponse.json({ error: dates.length || cursors.length || upcoming.length || reviews.length || freshness.length ? "Invalid dashboard filters" : "Invalid workplace filter", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    return NextResponse.json(await teacherDashboardSummary(db, user.id, input.data.workplaceId, input.data.date, input.data.homeworkAfter, input.data.closeReview, input.data.ratingFreshness, input.data.upcomingAfter),
      {headers: {"cache-control": "private, no-store"}});
  } catch (error) {
    if (error instanceof WorkplaceContextError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if(error instanceof TeacherOverviewError && error.status===400)
      return NextResponse.json({error:error.message,code:"VALIDATION_ERROR"},{status:400});
    return NextResponse.json({ error: "Dashboard unavailable" }, {status:500});
  }
}
