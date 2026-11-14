import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {trainingPlanListSchema,trainingPlanGetSchema,trainingPlanCommitSchema,
  teacherTrainingPlansList,teacherTrainingPlanGet,teacherTrainingPlanCommit,
  TrainingPlanError} from "@/lib/server/student-training-plans";

async function auth(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 return user?{db,teacherId:user.id}:null;
}
function failure(error:unknown){
 const isKnown=error instanceof TrainingPlanError;
 return NextResponse.json({error:isKnown?error.message:"Training plan unavailable",
  code:isKnown?error.code:"DATABASE_ERROR"},{status:isKnown?error.status:500});
}
export async function GET(request:NextRequest){
 const ctx=await auth();
 if(!ctx)return NextResponse.json({error:"Unauthorized"},{status:401});
 const p=request.nextUrl.searchParams;
 const planId=p.get("planId");
 if(planId){
   const parsed=trainingPlanGetSchema.safeParse({planId});
   if(!parsed.success)return NextResponse.json({error:"Invalid plan ID"},{status:400});
   try{
     return NextResponse.json(await teacherTrainingPlanGet(ctx.db,ctx.teacherId,planId),
      {headers:{"Cache-Control":"no-store"}});
   }catch(error){return failure(error);}
 }
 const parsed=trainingPlanListSchema.safeParse({
   studentId:p.get("studentId"),includeArchived:p.get("includeArchived")==="true",
   limit:Number(p.get("limit")??30),offset:Number(p.get("offset")??0),
 });
 if(!parsed.success)return NextResponse.json({error:"Invalid plan filter"},{status:400});
 try{
   return NextResponse.json(await teacherTrainingPlansList(ctx.db,ctx.teacherId,parsed.data),
    {headers:{"Cache-Control":"no-store"}});
 }catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
 const ctx=await auth();
 if(!ctx)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=trainingPlanCommitSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({
   error:"Invalid explicit training plan",issues:parsed.error.issues,
 },{status:400});
 try{
   return NextResponse.json(await teacherTrainingPlanCommit(ctx.db,ctx.teacherId,parsed.data),
    {headers:{"Cache-Control":"no-store"}});
 }catch(error){return failure(error);}
}
