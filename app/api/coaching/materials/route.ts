import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
 materialsHistoryFilter,materialsHistoryRecord,materialsHistoryVoid,
 teacherMaterialHistory,teacherMaterialAggregate,teacherMaterialRecord,teacherMaterialVoid,MaterialHistoryError,
} from "@/lib/server/teacher-material-history";

async function authenticate() {
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 return user?{db,teacherId:user.id}:null;
}
function fail(error:unknown){
 return NextResponse.json({
  error:error instanceof MaterialHistoryError?error.message:"Material history unavailable",
  code:error instanceof MaterialHistoryError?error.code:"DATABASE_ERROR",
 },{status:error instanceof MaterialHistoryError?error.status:500});
}
export async function GET(req:NextRequest){
 const teacher=await authenticate();
 if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=req.nextUrl.searchParams;
 const parsed=materialsHistoryFilter.safeParse({
   studentId:q.get("studentId")||undefined,workplaceId:q.get("workplaceId")||undefined,
   sessionId:q.get("sessionId")||undefined,resourceId:q.get("resourceId")||undefined,
   stage:q.get("stage")||undefined,from:q.get("from")||undefined,to:q.get("to")||undefined,
   includeVoided:q.get("includeVoided")==="true",
   offset:Number(q.get("offset")??0),limit:Number(q.get("limit")??50),
 });
 if(!parsed.success)return NextResponse.json({error:"Invalid material history filter"},{status:400});
 try{return NextResponse.json(q.get("aggregate")==="true"
  ? await teacherMaterialAggregate(teacher.db,teacher.teacherId,parsed.data)
  : await teacherMaterialHistory(teacher.db,teacher.teacherId,parsed.data),{
  headers:{"Cache-Control":"no-store"},
 });}catch(error){return fail(error);}
}
export async function POST(req:NextRequest){
 const teacher=await authenticate();
 if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=materialsHistoryRecord.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid material claim",issues:parsed.error.issues},{status:400});
 try{return NextResponse.json(await teacherMaterialRecord(teacher.db,teacher.teacherId,parsed.data),{status:201});}
 catch(error){return fail(error);}
}
export async function PATCH(req:NextRequest){
 const teacher=await authenticate();
 if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=materialsHistoryVoid.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid material retraction"},{status:400});
 try{return NextResponse.json(await teacherMaterialVoid(teacher.db,teacher.teacherId,parsed.data));}
 catch(error){return fail(error);}
}
