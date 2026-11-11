import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guardianRotatePortalToken, GuardianServiceError } from "@/lib/server/teacher-guardian-service";
export async function POST(
  req:NextRequest,{params}:{params:Promise<{id:string}>}
) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>({}));
  if(!body||typeof body!=="object"||Array.isArray(body))
    return NextResponse.json({error:"Invalid request body"},{status:400});
  const requestId=(body as Record<string,unknown>).requestId;
  if(requestId!==undefined&&typeof requestId!=="string")
    return NextResponse.json({error:"requestId must be a UUID"},{status:400});
  try {return NextResponse.json(await guardianRotatePortalToken(
    db,user.id,(await params).id,requestId as string|undefined));}
  catch(error) {
    return NextResponse.json({error:error instanceof GuardianServiceError?error.message:"Family link unavailable"},{
      status:error instanceof GuardianServiceError?error.status:500,
    });
  }
}
