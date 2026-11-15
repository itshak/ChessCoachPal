import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {studyPreferenceListSchema,studyPreferenceResolveSchema,
 studyPreferenceSetSchema,teacherStudyPreferencesList,
 teacherStudyPreferenceResolve,teacherStudyPreferenceSet,
 StudyPreferenceError} from "@/lib/server/teacher-study-preferences";
import {z} from "zod";

const mutation=studyPreferenceSetSchema.extend({action:z.literal("set")}).strict();
function response(e:unknown){
 const known=e instanceof StudyPreferenceError;
 return NextResponse.json({error:known?e.message:"Study preference unavailable",
  code:known?e.code:"DATABASE_ERROR"},
 {status:known?e.status:500});
}
export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=req.nextUrl.searchParams;
 const mode=q.get("action")??"list";
 const keys=mode==="resolve"?["action","purpose","workplaceId","studentId"]:
  ["action","purpose","scope","scopeId","limit","offset"];
 if(!["list","resolve"].includes(mode)||
  [...q.keys()].some(k=>!keys.includes(k)||q.getAll(k).length!==1))
  return NextResponse.json({error:"Invalid study preference filter"},{status:400});
 try{
  if(mode==="resolve"){
   const parsed=studyPreferenceResolveSchema.safeParse({
    purpose:q.get("purpose"),
    ...(q.has("workplaceId")?{workplaceId:q.get("workplaceId")}:{}),
    ...(q.has("studentId")?{studentId:q.get("studentId")}:{}),
   });
   if(!parsed.success)return NextResponse.json({error:"Invalid preference scope"},{status:400});
   return NextResponse.json(await teacherStudyPreferenceResolve(db,user.id,parsed.data),{
    headers:{"Cache-Control":"no-store"}});
  }
  const parsed=studyPreferenceListSchema.safeParse({
   ...(q.has("purpose")?{purpose:q.get("purpose")}:{}),
   ...(q.has("scope")?{scope:q.get("scope")}:{}),
   ...(q.has("scopeId")?{scopeId:q.get("scopeId")}:{}),
   ...(q.has("limit")?{limit:Number(q.get("limit"))}:{}),
   ...(q.has("offset")?{offset:Number(q.get("offset"))}:{}),
  });
  if(!parsed.success)return NextResponse.json({error:"Invalid preference filter"},{status:400});
  return NextResponse.json(await teacherStudyPreferencesList(db,user.id,parsed.data),{
   headers:{"Cache-Control":"no-store"}});
 }catch(e){return response(e);}
}
export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=mutation.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid or unconfirmed preference action"},{status:400});
 const {action,...fields}=parsed.data;void action;
 try{return NextResponse.json(await teacherStudyPreferenceSet(db,user.id,fields),{
  headers:{"Cache-Control":"no-store"}});
 }catch(e){return response(e);}
}
