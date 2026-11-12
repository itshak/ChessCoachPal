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
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const raw=await req.text();
 let body:Record<string,unknown>={};
 if(raw.trim()){
   try{body=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
 }
 if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).some(key=>!["expectedUpdatedAt","idempotencyKey"].includes(key))||
     (body.expectedUpdatedAt!==undefined&&typeof body.expectedUpdatedAt!=="string")||
     (body.idempotencyKey!==undefined&&typeof body.idempotencyKey!=="string"))
   return NextResponse.json({error:"Invalid regeneration request"},{status:400});
 const options={
   expectedUpdatedAt:body.expectedUpdatedAt as string|undefined,
   idempotencyKey:body.idempotencyKey as string|undefined,
 };
 try{return await teacherBillingRegenerate(auth.db,auth.id,(await params).id,options);}
 catch(error){return failure(error);}
}
