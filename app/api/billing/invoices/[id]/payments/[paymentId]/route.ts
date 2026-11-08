import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {ManualPaymentError} from "@/lib/server/teacher-manual-payments";
async function teacher(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,teacherId:user.id}:null;
}
function fail(error:unknown){
 return NextResponse.json({error:error instanceof ManualPaymentError?error.message:"Payment unavailable"},{
  status:error instanceof ManualPaymentError?error.status:500,
 });
}
import {teacherManualPaymentDelete} from "@/lib/server/teacher-manual-payments";
/** Return a mistaken manual payment; database reopens a paid invoice if needed. */
export async function DELETE(_req:NextRequest,{params}:{
 params:Promise<{id:string;paymentId:string}>
}){
 const auth=await teacher();
 if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id,paymentId}=await params;
 try{return NextResponse.json(await teacherManualPaymentDelete(
  auth.db,auth.teacherId,id,paymentId));}
 catch(error){return fail(error);}
}
