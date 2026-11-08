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
import {teacherCreditRedemptionReturn} from "@/lib/server/teacher-credit-service";
export async function DELETE(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherCreditRedemptionReturn(teacher.db,teacher.id,(await params).id));}
 catch(error){return fail(error);}
}
