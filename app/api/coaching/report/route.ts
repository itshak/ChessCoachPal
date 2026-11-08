import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ReportServiceError, workplaceTeachingReport } from "@/lib/server/coaching-report-service";

export const dynamic = "force-dynamic";
const respond = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return respond({ error: "Unauthorized" }, 401);
  const workplaceId = request.nextUrl.searchParams.get("workplaceId") ?? "";
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  try {
    return respond(await workplaceTeachingReport(db, user.id, workplaceId, from, to));
  } catch (reason) {
    if (reason instanceof ReportServiceError)
      return respond({ error: reason.message }, reason.status);
    return respond({ error: "Report unavailable" }, 500);
  }
}
