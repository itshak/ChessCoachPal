import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CompletedArchivedRecoveryError,completedArchivedRecoveryPreviewSchema,completedArchivedRecoveryCommitSchema,
 teacherCompletedArchivedRecoveryPreview,teacherCompletedArchivedRecoveryCommit} from "@/lib/server/completed-archived-recovery";

const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
const failure=(caught:unknown)=>caught instanceof CompletedArchivedRecoveryError?
 reply({code:caught.code,error:caught.message},caught.status):
 reply({code:"DATABASE_ERROR",error:"Completed recovery unavailable"},503);

export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return reply({error:"Unauthorized"},401);
 const input=completedArchivedRecoveryPreviewSchema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return reply({code:"VALIDATION_ERROR",error:"Invalid completed lesson preview"},400);
 try{return reply(await teacherCompletedArchivedRecoveryPreview(db,user.id,input.data));}
 catch(caught){return failure(caught);}
}
export async function PUT(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return reply({error:"Unauthorized"},401);
 const input=completedArchivedRecoveryCommitSchema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return reply({code:"VALIDATION_ERROR",error:"Invalid completed lesson confirmation"},400);
 try{return reply(await teacherCompletedArchivedRecoveryCommit(db,input.data));}
 catch(caught){return failure(caught);}
}
