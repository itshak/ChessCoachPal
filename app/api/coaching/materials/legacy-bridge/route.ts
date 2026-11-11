import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {legacyMaterialBridgeListSchema,legacyMaterialBridgeChangeSchema,
  teacherLegacyMaterialBridgeList,teacherLegacyMaterialBridgeChange,
  LegacyMaterialBridgeError} from "@/lib/server/material-legacy-bridge";

async function auth(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 return user?{db,teacherId:user.id}:null;
}
function errorResponse(e:unknown){
 const known=e instanceof LegacyMaterialBridgeError;
 return NextResponse.json({
   error:known?e.message:"Historical material bridge unavailable",
   code:known?e.code:"DATABASE_ERROR",
 },{status:known?e.status:500});
}
export async function GET(request:NextRequest){
 const ctx=await auth();
 if(!ctx)return NextResponse.json({error:"Unauthorized"},{status:401});
 const p=request.nextUrl.searchParams;
 const input=legacyMaterialBridgeListSchema.safeParse({
  studentId:p.get("studentId")||undefined,sessionId:p.get("sessionId")||undefined,
  limit:Number(p.get("limit")??30),offset:Number(p.get("offset")??0),
 });
 if(!input.success)return NextResponse.json({error:"Invalid legacy material filter"},{status:400});
 try{
  return NextResponse.json(
    await teacherLegacyMaterialBridgeList(ctx.db,ctx.teacherId,input.data),
    {headers:{"Cache-Control":"no-store"}});
 }catch(e){return errorResponse(e);}
}
export async function POST(request:NextRequest){
 const ctx=await auth();
 if(!ctx)return NextResponse.json({error:"Unauthorized"},{status:401});
 const input=legacyMaterialBridgeChangeSchema.safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:"Invalid material mapping"},{status:400});
 try{
  return NextResponse.json(
    await teacherLegacyMaterialBridgeChange(ctx.db,ctx.teacherId,input.data),
    {headers:{"Cache-Control":"no-store"}});
 }catch(e){return errorResponse(e);}
}
