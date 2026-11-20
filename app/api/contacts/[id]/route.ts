import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {contactUpdateSchema} from "@/lib/server/contact-schemas";
import {contactDetail,contactUpdate,safeContact,ContactServiceError} from "@/lib/server/teacher-contacts-service";
const failure=(e:unknown)=>NextResponse.json({error:e instanceof ContactServiceError?e.message:"Contact unavailable",
  code:e instanceof ContactServiceError?e.code:"DATABASE_ERROR"},
  {status:e instanceof ContactServiceError?e.status:500});
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(safeContact(await contactDetail(db,user.id,id),true));}
  catch(e){return failure(e);}
}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=parseBody(contactUpdateSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{return NextResponse.json(await contactUpdate(db,user.id,id,parsed.data));}
  catch(e){return failure(e);}
}
