import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createStudentWithOptionalFamily } from "@/lib/server/families";
import { parseBody, studentCreateSchema } from "@/lib/server/api-schemas";
import { teacherStudentsRoster, StudentProfileError } from "@/lib/server/student-profile-service";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = req.nextUrl.searchParams;
  const paginate = params.has("limit") || params.has("offset") || params.has("query");
  const limit = paginate ? Number(params.get("limit") ?? 50) : 1000;
  const offset = Number(params.get("offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 ||
      !Number.isInteger(offset) || offset < 0 || offset > 100000)
    return NextResponse.json({ error: "Invalid pagination" }, { status: 400 });
  try {
    const roster = await teacherStudentsRoster(supabase, user.id, {
      query: params.get("query") ?? undefined,
      // Match the website Students page and the MCP roster default:
      // archived pupils remain accessible on explicit historical requests.
      includeArchived: params.get("includeArchived") === "true" &&
        params.get("activeOnly") !== "true",
      archivedOnly: params.get("archivedOnly") === "true" &&
        params.get("activeOnly") !== "true",
      limit, offset,
    });
    return NextResponse.json(paginate ? roster : roster.students);
  } catch (error) {
    return NextResponse.json({ error: "Student roster unavailable" }, {
      status: error instanceof StudentProfileError ? error.status : 500,
    });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseBody(studentCreateSchema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // A keyed replay that already created a student may have filled the last
  // hosted slot. Do not reject it before the atomic SQL receipt can replay;
  // new writes are independently capacity-checked by the database trigger.
  if (!body.idempotencyKey) {
    const {
      assertWithinHostedLimit,
      limitReachedResponse,
    } = await import("@/lib/server/entitlements");
    const limitCheck = await assertWithinHostedLimit(supabase, user.id, "students");
    if (!limitCheck.allowed) {
      return NextResponse.json(limitReachedResponse(limitCheck), { status: 403 });
    }
  }

  const result = await createStudentWithOptionalFamily(supabase, user.id, {
    name: body.name,
    birthdate: body.birthdate ?? null,
    level: body.level ?? null,
    teacherNotes: body.teacherNotes ?? null,
    guardianId: body.guardianId ?? null,
    contactEmail: body.contactEmail ?? null,
    contactPhone: body.contactPhone ?? null,
    contactName: body.contactName ?? null,
    adultSelf: Boolean(body.adultSelf),
    idempotencyKey: body.idempotencyKey,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(
    { ...result.student, createdFamily: result.createdFamily },
    { status: 201 }
  );
}
