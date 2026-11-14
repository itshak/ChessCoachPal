import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
 canonicalSlotUpdate,canonicalSlotDelete,CanonicalSlotError,
} from "@/lib/server/canonical-slot-service";

type Ctx={params:Promise<{id:string}>};
const failure=(e:unknown)=>NextResponse.json({
 error:e instanceof CanonicalSlotError?e.message:"Recurring slot unavailable",
 code:e instanceof CanonicalSlotError?e.code:"DATABASE_ERROR",
},{status:e instanceof CanonicalSlotError?e.status:500,
  headers:{"Cache-Control":"no-store"}});
async function owner(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id}:null;
}
export async function PATCH(req:NextRequest,{params}:Ctx){
 const auth=await owner();
 if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))
  return NextResponse.json({error:"Invalid recurring slot edit"},{status:400});
 try{return NextResponse.json(await canonicalSlotUpdate(
   auth.db,auth.id,(await params).id,body),
   {headers:{"Cache-Control":"no-store"}});}
 catch(e){return failure(e);}
}
export async function DELETE(req:NextRequest,{params}:Ctx){
 const auth=await owner();
 if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))
  return NextResponse.json({error:"Idempotency key required"},{status:400});
 try{return NextResponse.json(await canonicalSlotDelete(
   auth.db,auth.id,(await params).id,body),
   {headers:{"Cache-Control":"no-store"}});}
 catch(e){return failure(e);}
}
