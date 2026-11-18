import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {browserApiOrigin} from "@/lib/server/http";
import {parseBody} from "@/lib/server/api-schemas";
import {portalGrantRevokeSchema} from "@/lib/server/portal-grant-schemas";
import {teacherPortalGrantGet,teacherPortalGrantRevoke,PortalGrantError}
  from "@/lib/server/portal-grants-service";
export const dynamic="force-dynamic";
const opts={headers:{"Cache-Control":"no-store"}};
const failure=(e:unknown)=>NextResponse.json({error:e instanceof PortalGrantError?e.code:"DATABASE_ERROR"},
  {...opts,status:e instanceof PortalGrantError?e.status:500});
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  try{return NextResponse.json(await teacherPortalGrantGet(db,user.id,(await params).id),opts);}
  catch(e){return failure(e);}
}
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(req.headers.get("origin")!==browserApiOrigin(req))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const parsed=parseBody(portalGrantRevokeSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{return NextResponse.json(await teacherPortalGrantRevoke(db,user.id,(await params).id,parsed.data),opts);}
  catch(e){return failure(e);}
}
