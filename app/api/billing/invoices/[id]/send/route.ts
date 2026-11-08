import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/server/http";
import {teacherInvoiceSend,InvoiceActionError} from "@/lib/server/teacher-invoice-actions";
/** Send must always be explicit: saving a draft never sends email. */
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherInvoiceSend(db,user.id,(await params).id,user.email,requestOrigin(req)));}
 catch(error){return NextResponse.json({error:error instanceof InvoiceActionError?error.message:"Invoice sending failed"},{
  status:error instanceof InvoiceActionError?error.status:500,
 });}
}
