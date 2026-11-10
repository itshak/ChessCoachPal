import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
 materialsHistoryFilter,materialsHistoryRecord,materialsHistoryVoid,
 teacherMaterialHistory,teacherMaterialAggregate,teacherMaterialRecord,teacherMaterialVoid,MaterialHistoryError,
} from "@/lib/server/teacher-material-history";

import {
 defaultCreateSchema,defaultUpdateSchema,defaultArchiveSchema,
 teacherMaterialDefaultsList,teacherMaterialDefaultCreate,
 teacherMaterialDefaultUpdate,teacherMaterialDefaultArchive,MaterialDefaultError,
} from "@/lib/server/teacher-material-defaults";

async function authenticate() {
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 return user?{db,teacherId:user.id}:null;
}
function fail(error:unknown){
 return NextResponse.json({
  error:error instanceof MaterialDefaultError||error instanceof MaterialHistoryError?
   error.message:"Material history unavailable",
  code:error instanceof MaterialDefaultError||error instanceof MaterialHistoryError?
   error.code:"DATABASE_ERROR",
 },{status:error instanceof MaterialDefaultError||error instanceof MaterialHistoryError?
   error.status:500});
}
export async function GET(req:NextRequest){
 const teacher=await authenticate();
 if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=req.nextUrl.searchParams;
 if(q.get("defaults")==="true"){
  const workplaceId=q.get("workplaceId")??"";
  const groupId=q.get("groupId")??undefined;
  if(!/^[0-9a-f-]{36}$/i.test(workplaceId)||groupId&&!/^[0-9a-f-]{36}$/i.test(groupId))
    return NextResponse.json({error:"Invalid material default scope"},{status:400});
  try{return NextResponse.json(await teacherMaterialDefaultsList(
    teacher.db,teacher.teacherId,{
      workplaceId,groupId,includeArchived:q.get("includeArchived")==="true",
    }),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return fail(error);}
 }
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
 const raw=await req.json().catch(()=>null);
 if(raw?.operation==="default.create"){
  const parsed=defaultCreateSchema.safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:"Invalid material default"},{status:400});
  try{return NextResponse.json(await teacherMaterialDefaultCreate(
    teacher.db,teacher.teacherId,parsed.data),{status:201});}
  catch(error){return fail(error);}
 }
 const parsed=materialsHistoryRecord.safeParse(raw);
 if(!parsed.success)return NextResponse.json({error:"Invalid material claim",issues:parsed.error.issues},{status:400});
 try{return NextResponse.json(await teacherMaterialRecord(teacher.db,teacher.teacherId,parsed.data),{status:201});}
 catch(error){return fail(error);}
}
export async function PATCH(req:NextRequest){
 const teacher=await authenticate();
 if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const raw=await req.json().catch(()=>null);
 if(raw?.operation==="default.update"){
  const parsed=defaultUpdateSchema.safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:"Invalid material default update"},{status:400});
  try{return NextResponse.json(await teacherMaterialDefaultUpdate(
    teacher.db,teacher.teacherId,parsed.data));}
  catch(error){return fail(error);}
 }
 if(raw?.operation==="default.archive"){
  const parsed=defaultArchiveSchema.safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:"Invalid material default archive"},{status:400});
  try{return NextResponse.json(await teacherMaterialDefaultArchive(
    teacher.db,teacher.teacherId,parsed.data));}
  catch(error){return fail(error);}
 }
 const parsed=materialsHistoryVoid.safeParse(raw);
 if(!parsed.success)return NextResponse.json({error:"Invalid material retraction"},{status:400});
 try{return NextResponse.json(await teacherMaterialVoid(teacher.db,teacher.teacherId,parsed.data));}
 catch(error){return fail(error);}
}
