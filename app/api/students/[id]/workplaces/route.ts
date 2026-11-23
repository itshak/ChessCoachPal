import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CoachError} from "@/lib/server/coach-service";
import {studentWorkplacesList,studentWorkplacesSchema} from "@/lib/server/student-workplaces-service";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 const parsed=studentWorkplacesSchema.safeParse({studentId:id});
 if(!parsed.success)return NextResponse.json({code:"VALIDATION_ERROR",error:"Invalid student ID"},{status:400,headers});
 try{return NextResponse.json(await studentWorkplacesList(db,user.id,parsed.data),{headers});}
 catch(error){
  if(error instanceof CoachError)return NextResponse.json({code:error.code,error:error.message},{status:error.status,headers});
  return NextResponse.json({code:"DATABASE_ERROR",error:"Student workplaces unavailable"},{status:500,headers});
 }
}
