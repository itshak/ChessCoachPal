import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dailyHomeworkFocusInput, teacherDailyHomeworkFocus } from "@/lib/server/daily-homework";

export async function GET(request: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const input = dailyHomeworkFocusInput.safeParse(Object.fromEntries(params));
  if (!input.success || Array.from(params).length !== 2) {
    return NextResponse.json({ error: "Invalid homework focus" }, { status: 400 });
  }
  return NextResponse.json(await teacherDailyHomeworkFocus(db, user.id, input.data), {
    headers: { "Cache-Control": "no-store" },
  });
}
