import { NextRequest, NextResponse } from "next/server";
import {z} from "zod";
import { createClient } from "@/lib/supabase/server";
import {teacherInvoiceVoid,InvoiceActionError} from "@/lib/server/teacher-invoice-actions";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=z.object({idempotencyKey:z.string().uuid().optional()}).strict()
   .safeParse(await req.json().catch(()=>({})));
 if(!parsed.success)return NextResponse.json({
   error:"Invalid invoice void request",code:"VALIDATION_ERROR",
 },{status:400});
 try{return NextResponse.json(await teacherInvoiceVoid(
   db,user.id,(await params).id,parsed.data.idempotencyKey));}
 catch(error){return NextResponse.json({error:error instanceof InvoiceActionError?error.message:"Cannot void invoice"},{
  status:error instanceof InvoiceActionError?error.status:500,
 });}
}
