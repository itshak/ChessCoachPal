import {teacherInvoiceSendPreview,InvoiceSendPreviewError} from "@/lib/server/teacher-invoice-send-preview";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/server/http";
import {teacherInvoiceSend,InvoiceActionError} from "@/lib/server/teacher-invoice-actions";
/** Send must always be explicit: saving a draft never sends email. */
/** Preview before an external email; no invoice status or email mutation. */
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherInvoiceSendPreview(db,user.id,(await params).id,
   req.nextUrl.searchParams.get("includeRecipients")==="true"),{
   headers:{"Cache-Control":"no-store"},
 });}
 catch(error){return NextResponse.json({
   error:error instanceof InvoiceSendPreviewError?error.message:"Invoice preview unavailable",
 },{status:error instanceof InvoiceSendPreviewError?error.status:500});}
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherInvoiceSend(db,user.id,(await params).id,user.email,requestOrigin(req)));}
 catch(error){return NextResponse.json({error:error instanceof InvoiceActionError?error.message:"Invoice sending failed"},{
  status:error instanceof InvoiceActionError?error.status:500,
 });}
}
