import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {browserApiOrigin} from "@/lib/server/http";
import {parseBody} from "@/lib/server/api-schemas";
import {portalGrantRevokeSchema,portalGrantRenewPreviewSchema,portalGrantRenewSchema} from "@/lib/server/portal-grant-schemas";
import {teacherPortalGrantGet,teacherPortalGrantRevoke,teacherPortalGrantRenewPreview,teacherPortalGrantRenew,PortalGrantError}
  from "@/lib/server/portal-grants-service";
export const dynamic="force-dynamic";
const opts={headers:{"Cache-Control":"no-store"}};
const failure=(e:unknown)=>NextResponse.json({error:e instanceof PortalGrantError?e.code:"DATABASE_ERROR"},
  {...opts,status:e instanceof PortalGrantError?e.status:500});
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const {id}=await params;
  const requestedExpiry=req.nextUrl.searchParams.get("renewExpiresAt");
  if(requestedExpiry!==null){
    const parsed=portalGrantRenewPreviewSchema.safeParse({expiresAt:requestedExpiry});
    if(!parsed.success)return NextResponse.json({error:"VALIDATION_ERROR"},{...opts,status:400});
    try{return NextResponse.json(await teacherPortalGrantRenewPreview(db,user.id,id,parsed.data),opts);}
    catch(e){return failure(e);}
  }
  try{return NextResponse.json(await teacherPortalGrantGet(db,user.id,id),opts);}
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

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(req.headers.get("origin")!==browserApiOrigin(req))
    return NextResponse.json({error:"FORBIDDEN"},{...opts,status:403});
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{...opts,status:401});
  const parsed=parseBody(portalGrantRenewSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{return NextResponse.json(await teacherPortalGrantRenew(db,user.id,(await params).id,parsed.data),opts);}
  catch(e){return failure(e);}
}
