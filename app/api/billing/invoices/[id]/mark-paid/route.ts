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
import {teacherManualPaymentRecord,type ManualPaymentInput} from "@/lib/server/teacher-manual-payments";
/** Record a manually collected payment; never charge a card or send email. */
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await teacher();
 if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const input=await req.json().catch(()=>({}));
 if(!input||typeof input!=="object"||Array.isArray(input))
  return NextResponse.json({error:"Invalid payment request"},{status:400});
 try{return NextResponse.json(await teacherManualPaymentRecord(
  auth.db,auth.teacherId,(await params).id,input as ManualPaymentInput));}
 catch(error){return fail(error);}
}
