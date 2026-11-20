import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {contactCreateSchema} from "@/lib/server/contact-schemas";
import {contactsList,contactCreate,ContactServiceError} from "@/lib/server/teacher-contacts-service";
const failure=(e:unknown)=>NextResponse.json({error:e instanceof ContactServiceError?e.message:"Contacts unavailable",
  code:e instanceof ContactServiceError?e.code:"DATABASE_ERROR"},
  {status:e instanceof ContactServiceError?e.status:500});
export async function GET(){
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await contactsList(db,user.id));}catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=parseBody(contactCreateSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{return NextResponse.json(await contactCreate(db,user.id,parsed.data),{status:201});}
  catch(e){return failure(e);}
}
