import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { parseBody, studentUpdateSchema } from "@/lib/server/api-schemas";
import { teacherStudentArchivePreview, teacherStudentDeleteImpact, teacherStudentDelete, teacherStudentPatch, teacherStudentProfile, StudentProfileError } from "@/lib/server/student-profile-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    if (req.nextUrl.searchParams.get("deletePreview") === "true")
      return NextResponse.json(await teacherStudentDeleteImpact(db,user.id,id));
    if (req.nextUrl.searchParams.get("archivePreview") === "true")
      return NextResponse.json(await teacherStudentArchivePreview(db,user.id,id));
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

const deletePayload=z.object({confirmed:z.literal(true),
  expectedUpdatedAt:z.string().datetime({offset:true})}).strict();
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=deletePayload.safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({
    error:"Delete requires explicit confirmation and reviewed revision",code:"CONFIRMATION_REQUIRED",
  },{status:400});
  try{return NextResponse.json(await teacherStudentDelete(db,user.id,id,parsed.data.expectedUpdatedAt));}
  catch(error){
    return NextResponse.json({
      error:error instanceof StudentProfileError?error.message:"Student deletion failed",
      code:error instanceof StudentProfileError?error.code:"DATABASE_ERROR",
    },{status:error instanceof StudentProfileError?error.status:500});
  }
}
