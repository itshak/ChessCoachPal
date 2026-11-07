import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { clientById } from "@/lib/server/agent-oauth";
import { digest } from "@/lib/server/agent-oauth-core";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded") ||
      Number(req.headers.get("content-length") ?? 0) > 8192)
    return NextResponse.json({error:"invalid_request"},{status:400});
  const b = new URLSearchParams(await req.text());
  const clientId = b.get("client_id") ?? "";
  if (!await clientById(clientId)) return NextResponse.json({error:"invalid_client"},{status:400});
  const hash = digest(b.get("token") ?? "");
  const db = createServiceClient();
  const column = b.get("token_type_hint") === "access_token" ? "access_hash" : "refresh_hash";
  await db.from("agent_oauth_grants").update({revoked_at:new Date().toISOString()})
    .eq("client_id",clientId).eq(column,hash).is("revoked_at",null);
  return new NextResponse(null,{status:200,headers:{"Cache-Control":"no-store"}});
}
