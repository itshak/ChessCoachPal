import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {teacherInvoiceDelete,teacherInvoiceDraftUpdate,InvoiceActionError,type InvoiceDraftEdit} from "@/lib/server/teacher-invoice-actions";
import { teacherInvoiceDetail,TeacherBillingError } from "@/lib/server/teacher-billing-read-service";
import {invoiceDraftEditSchema} from "@/lib/server/invoice-draft-schemas";

export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await teacherInvoiceDetail(db,user.id,id));}
  catch(error){return NextResponse.json({error:error instanceof TeacherBillingError?error.message:"Invoice unavailable"},{
    status:error instanceof TeacherBillingError?error.status:500,
  });}
}

function actionFailure(error:unknown) {
  return NextResponse.json({error:error instanceof InvoiceActionError?error.message:"Invoice action failed"},{
    status:error instanceof InvoiceActionError?error.status:500,
  });
}
export async function PUT(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  const parsed=invoiceDraftEditSchema.safeParse(body);
  if(!parsed.success)
    return NextResponse.json({error:"Invalid draft invoice edit",code:"VALIDATION_ERROR"},{status:400});
  try{return NextResponse.json(await teacherInvoiceDraftUpdate(
    db,user.id,(await params).id,parsed.data as InvoiceDraftEdit));}
  catch(error){return actionFailure(error);}
}
export async function DELETE(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await teacherInvoiceDelete(db,user.id,(await params).id));}
  catch(error){return actionFailure(error);}
}
