import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  assignmentListSchema,assignmentCreateSchema,assignmentAttemptSchema,assignmentReviewSchema,
  teacherAssignmentsList,teacherAssignmentsCreate,teacherAssignmentAttempt,teacherAssignmentReview,
  AssignmentServiceError,
} from "@/lib/server/training-assignments";

async function authenticate(){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?{db,teacherId:user.id}:null;
}
function respondError(error:unknown){
  return NextResponse.json({
    error:error instanceof AssignmentServiceError?error.message:"Homework unavailable",
    code:error instanceof AssignmentServiceError?error.code:"DATABASE_ERROR",
  },{status:error instanceof AssignmentServiceError?error.status:500});
}
export async function GET(request:NextRequest){
  const context=await authenticate();
  if(!context)return NextResponse.json({error:"Unauthorized"},{status:401});
  const params=request.nextUrl.searchParams;
  const parsed=assignmentListSchema.safeParse({
    studentId:params.get("studentId"),limit:Number(params.get("limit")??30),
    offset:Number(params.get("offset")??0),
  });
  if(!parsed.success)return NextResponse.json({error:"Invalid homework filter"},{status:400});
  try{return NextResponse.json(await teacherAssignmentsList(context.db,context.teacherId,parsed.data),
    {headers:{"Cache-Control":"no-store"}});}catch(error){return respondError(error);}
}
export async function POST(request:NextRequest){
  const context=await authenticate();
  if(!context)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=assignmentCreateSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Invalid assignment",issues:parsed.error.issues},{status:400});
  try{return NextResponse.json(await teacherAssignmentsCreate(context.db,context.teacherId,parsed.data),
    {status:201});}catch(error){return respondError(error);}
}
export async function PATCH(request:NextRequest){
  const context=await authenticate();
  if(!context)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object")return NextResponse.json({error:"Invalid homework action"},{status:400});
  if(body.action==="attempt"){
    // Strip the route discriminator before strict domain validation.
    const source={...body};delete source.action;
    const clean=assignmentAttemptSchema.safeParse(source);
    if(!clean.success)return NextResponse.json({error:"Invalid assignment attempt"},{status:400});
    try{return NextResponse.json(await teacherAssignmentAttempt(context.db,context.teacherId,clean.data));}
    catch(error){return respondError(error);}
  }
  if(body.action==="review"){
    const source={...body};delete source.action;
    const parsed=assignmentReviewSchema.safeParse(source);
    if(!parsed.success)return NextResponse.json({error:"Invalid assignment review"},{status:400});
    try{return NextResponse.json(await teacherAssignmentReview(context.db,context.teacherId,parsed.data));}
    catch(error){return respondError(error);}
  }
  return NextResponse.json({error:"Unknown homework action"},{status:400});
}
