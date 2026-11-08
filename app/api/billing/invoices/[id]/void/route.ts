import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {teacherInvoiceVoid,InvoiceActionError} from "@/lib/server/teacher-invoice-actions";
export async function POST(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherInvoiceVoid(db,user.id,(await params).id));}
 catch(error){return NextResponse.json({error:error instanceof InvoiceActionError?error.message:"Cannot void invoice"},{
  status:error instanceof InvoiceActionError?error.status:500,
 });}
}
