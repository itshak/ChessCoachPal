import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {LearnerEvidenceError,learnerEvidenceSchema,teacherLearnerEvidence} from "@/lib/server/learner-evidence";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({code:"UNAUTHENTICATED",error:"Unauthorized"},{status:401,headers});
 const input=learnerEvidenceSchema.safeParse({studentId:id});
 if(!input.success)return NextResponse.json({code:"VALIDATION_ERROR",error:"Invalid student ID"},{status:400,headers});
 try{return NextResponse.json(await teacherLearnerEvidence(db,user.id,input.data),{headers});}
 catch(error){
  if(error instanceof LearnerEvidenceError)
   return NextResponse.json({code:error.code,error:error.message},{status:error.status,headers});
  return NextResponse.json({code:"DATABASE_ERROR",error:"Learner evidence unavailable"},{status:503,headers});
 }
}
