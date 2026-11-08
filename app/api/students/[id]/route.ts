import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { retireEmptyGuardians } from "@/lib/server/families";
import { parseBody, studentUpdateSchema } from "@/lib/server/api-schemas";
import { teacherStudentPatch, teacherStudentProfile, StudentProfileError } from "@/lib/server/student-profile-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    return NextResponse.json(await teacherStudentProfile(db,user.id,id));
  } catch(error) {
    return NextResponse.json({error:error instanceof StudentProfileError?error.message:"Student unavailable"},{
      status:error instanceof StudentProfileError?error.status:500,
    });
  }
}
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed = parseBody(studentUpdateSchema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json(await teacherStudentPatch(db,user.id,id,parsed.data));
  } catch(error) {
    return NextResponse.json({
      error:error instanceof StudentProfileError?error.message:"Student update failed",
      code:error instanceof StudentProfileError?error.code:"DATABASE_ERROR",
    },{status:error instanceof StudentProfileError?error.status:500});
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("students")
    .select("guardian_id")
    .eq("id", id)
    .eq("teacher_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("students")
    .delete()
    .eq("id", id)
    .eq("teacher_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (existing?.guardian_id) {
    await retireEmptyGuardians(supabase, user.id, [existing.guardian_id]);
  }

  return NextResponse.json({ ok: true });
}
