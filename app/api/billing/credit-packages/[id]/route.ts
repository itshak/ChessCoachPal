import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CreditServiceError } from "@/lib/server/teacher-credit-service";
async function auth(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id}:null;
}
const fail=(error:unknown)=>NextResponse.json({
 error:error instanceof CreditServiceError?error.message:"Credit service unavailable",
},{status:error instanceof CreditServiceError?error.status:500});
import {parseBody,creditPackageUpdateSchema} from "@/lib/server/api-schemas";
import {teacherCreditPackageExpiry} from "@/lib/server/teacher-credit-service";
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=parseBody(creditPackageUpdateSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 try{return NextResponse.json(await teacherCreditPackageExpiry(teacher.db,teacher.id,
  (await params).id,parsed.data.expiresOn||null));}
 catch(error){return fail(error);}
}
