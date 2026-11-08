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
import {requestOrigin} from "@/lib/server/http";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return await teacherBillingCheckout(auth.db,auth.id,(await params).id,requestOrigin(req));}
 catch(error){return failure(error);}
}
