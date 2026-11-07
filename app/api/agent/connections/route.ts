import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { oauthOrigin } from "@/lib/server/agent-oauth-core";

export const dynamic = "force-dynamic";
async function teacherId() {
  const db = await createClient();
  const {data:{user},error} = await db.auth.getUser();
  return error ? null : user?.id ?? null;
}
export async function GET() {
  const teacher = await teacherId();
  if (!teacher) return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const {data,error}=await createServiceClient().from("agent_oauth_grants")
    .select("id,client_id,scopes,created_at,revoked_at")
    .eq("teacher_id",teacher).is("revoked_at",null).order("created_at",{ascending:false});
  return error ? NextResponse.json({error:"UNAVAILABLE"},{status:503})
    : NextResponse.json({connections:data},{headers:{"Cache-Control":"no-store"}});
}
export async function DELETE(req: NextRequest) {
  if (req.headers.get("origin") !== oauthOrigin()) return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const teacher = await teacherId();
  if (!teacher) return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const body = await req.json().catch(()=>null);
  if (!body || typeof body.id!=="string" || !/^[0-9a-f-]{36}$/i.test(body.id))
    return NextResponse.json({error:"VALIDATION_ERROR"},{status:400});
  const {error} = await createServiceClient().from("agent_oauth_grants")
    .update({revoked_at:new Date().toISOString()}).eq("id",body.id).eq("teacher_id",teacher)
    .is("revoked_at",null);
  return error ? NextResponse.json({error:"UNAVAILABLE"},{status:503})
    : NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}
