import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, guardianCreateSchema } from "@/lib/server/api-schemas";
import { guardianCreate, guardiansList, GuardianServiceError } from "@/lib/server/teacher-guardian-service";
function fail(error:unknown) {
  return NextResponse.json({error:error instanceof GuardianServiceError?error.message:"Family unavailable"},{
    status:error instanceof GuardianServiceError?error.status:500,
  });
}
export async function GET() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await guardiansList(db,user.id));}catch(error){return fail(error);}
}
export async function POST(req:NextRequest) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=parseBody(guardianCreateSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{return NextResponse.json(await guardianCreate(db,user.id,parsed.data));}
  catch(error){return fail(error);}
}
