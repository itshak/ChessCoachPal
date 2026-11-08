import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  teacherNotificationsList, teacherNotificationsMarkRead, TeacherOverviewError,
} from "@/lib/server/teacher-overview-service";

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await teacherNotificationsList(db, user.id));
  } catch (error) {
    return NextResponse.json({ error: "Notifications unavailable" }, {
      status: error instanceof TeacherOverviewError ? error.status : 500,
    });
  }
}

/** Mark one or all of this teacher's notifications read. */
export async function PATCH(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: unknown = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "id or all required" }, { status: 400 });
  const options = body as Record<string, unknown>;
  if (options.all !== true && typeof options.id !== "string")
    return NextResponse.json({ error: "id or all required" }, { status: 400 });
  try {
    return NextResponse.json(await teacherNotificationsMarkRead(db, user.id, {
      all: options.all === true,
      id: typeof options.id === "string" ? options.id : undefined,
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof TeacherOverviewError ?
      error.message : "Notifications unavailable" }, {
      status: error instanceof TeacherOverviewError ? error.status : 500,
    });
  }
}
