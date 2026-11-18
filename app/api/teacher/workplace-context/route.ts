import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {browserApiOrigin} from "@/lib/server/http";
import {teacherWorkplaceContextGet,teacherWorkplaceContextSet,
  workplaceContextUpdateSchema,WorkplaceContextError}
  from "@/lib/server/teacher-workplace-context";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const failure=(e:unknown)=>NextResponse.json({error:e instanceof WorkplaceContextError?e.code:"DATABASE_ERROR"},
  {status:e instanceof WorkplaceContextError?e.status:500,headers});
export async function GET(){
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401,headers});
  try{return NextResponse.json(await teacherWorkplaceContextGet(db,user.id),{headers});}
  catch(error){return failure(error);}
}
export async function PUT(req:NextRequest){
  if(req.headers.get("origin")!==browserApiOrigin(req))
    return NextResponse.json({error:"FORBIDDEN"},{status:403,headers});
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401,headers});
  const parsed=parseBody(workplaceContextUpdateSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{return NextResponse.json(await teacherWorkplaceContextSet(db,user.id,parsed.data),{headers});}
  catch(error){return failure(error);}
}
