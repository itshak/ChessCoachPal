import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
 teacherBillingGenerate,teacherBillingRegenerate,teacherBillingCheckout,teacherBillingBulk,
} from "@/lib/server/teacher-billing-operations";
async function teacher(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id,email:user.email}:null;
}
function failure(error:unknown){
 return NextResponse.json({error:error instanceof Error?error.message:"Billing operation unavailable"},{status:500});
}
export async function POST(req:NextRequest){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Invalid JSON"},{status:400});
 try{return await teacherBillingGenerate(auth.db,auth.id,body);}
 catch(error){return failure(error);}
}
