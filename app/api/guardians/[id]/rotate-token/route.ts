import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guardianRotatePortalToken, GuardianServiceError } from "@/lib/server/teacher-guardian-service";
export async function POST(
  _req:NextRequest,{params}:{params:Promise<{id:string}>}
) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try {return NextResponse.json(await guardianRotatePortalToken(db,user.id,(await params).id));}
  catch(error) {
    return NextResponse.json({error:error instanceof GuardianServiceError?error.message:"Family link unavailable"},{
      status:error instanceof GuardianServiceError?error.status:500,
    });
  }
}
