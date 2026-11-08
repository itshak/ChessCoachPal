import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { teacherPaymentsExport,TeacherBillingError } from "@/lib/server/teacher-billing-read-service";
export async function GET(req:NextRequest) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const params=req.nextUrl.searchParams;
    const result=await teacherPaymentsExport(db,user.id,{
      from:params.get("from")||undefined,to:params.get("to")||undefined,
    });
    return new NextResponse(result.csv,{
      headers:{"Content-Type":"text/csv; charset=utf-8",
        "Content-Disposition":'attachment; filename="payments-export.csv"',
        "Cache-Control":"no-store"},
    });
  } catch(error) {
    return NextResponse.json({error:error instanceof TeacherBillingError?error.message:"Payment export unavailable"},{
      status:error instanceof TeacherBillingError?error.status:500,
    });
  }
}
