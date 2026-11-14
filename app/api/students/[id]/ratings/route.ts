import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {z} from "zod";
import {ratingRecordSchema,ratingFetchSchema,ratingListSchema} from "@/lib/chess-public-ratings";
import {ratingRefreshCommitSchema,teacherStudentRatingHistory,
 teacherStudentRatingRecord,teacherStudentRatingRefreshPreview,
 teacherStudentRatingRefreshCommit,StudentRatingError} from "@/lib/server/student-rating-snapshots";
import {StudentProfileError} from "@/lib/server/student-profile-service";
const actions=z.discriminatedUnion("action",[
 ratingRecordSchema.omit({studentId:true}).extend({action:z.literal("manual")}),
 ratingFetchSchema.omit({studentId:true}).extend({action:z.literal("refreshPreview")}),
 ratingRefreshCommitSchema.omit({studentId:true}).extend({action:z.literal("refreshCommit")}),
]);
const errorResponse=(caught:unknown)=>NextResponse.json({
 error:caught instanceof StudentRatingError||caught instanceof StudentProfileError?
  caught.message:"Student rating operation unavailable",
 code:caught instanceof StudentRatingError||caught instanceof StudentProfileError?
  caught.code:"DATABASE_ERROR",
},{status:caught instanceof StudentRatingError||caught instanceof StudentProfileError?
  caught.status:500});
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=req.nextUrl.searchParams;
 const parsed=ratingListSchema.safeParse({
  studentId:id,...(q.has("provider")?{provider:q.get("provider")}:{}),
  ...(q.has("timeControl")?{timeControl:q.get("timeControl")}:{}),
  ...(q.has("limit")?{limit:Number(q.get("limit"))}:{}),
  ...(q.has("offset")?{offset:Number(q.get("offset"))}:{}),
 });
 if(!parsed.success||[...q.keys()].some(k=>!["provider","timeControl","limit","offset"].includes(k))||
   ["provider","timeControl","limit","offset"].some(k=>q.getAll(k).length>1))
  return NextResponse.json({error:"Invalid rating history filter"},{status:400});
 try{return NextResponse.json(await teacherStudentRatingHistory(db,user.id,parsed.data),{
  headers:{"Cache-Control":"no-store"},
 });}catch(e){return errorResponse(e);}
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=actions.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid or unconfirmed rating action"},{status:400});
 try{
  const {action,...rest}=parsed.data;
  const input={...rest,studentId:id};
  const result=action==="manual"?
   await teacherStudentRatingRecord(db,user.id,input as Parameters<typeof teacherStudentRatingRecord>[2]):
   action==="refreshPreview"?
    await teacherStudentRatingRefreshPreview(db,user.id,input as Parameters<typeof teacherStudentRatingRefreshPreview>[2]):
    await teacherStudentRatingRefreshCommit(db,user.id,input as Parameters<typeof teacherStudentRatingRefreshCommit>[2]);
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(e){return errorResponse(e);}
}
