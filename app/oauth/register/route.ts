import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { randomToken, validateRedirectUri } from "@/lib/server/agent-oauth-core";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json") ||
      Number(req.headers.get("content-length") ?? 0) > 8192)
    return NextResponse.json({ error: "invalid_client_metadata" }, {status:400});
  const input = await req.json().catch(() => null);
  try {
    if (!input || typeof input.client_name !== "string" ||
        input.client_name.length < 1 || input.client_name.length > 100 ||
        !Array.isArray(input.redirect_uris) || input.redirect_uris.length === 0 ||
        input.redirect_uris.length > 5 || !input.redirect_uris.every((v:unknown) => typeof v === "string") ||
        (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none"))
      throw new Error("invalid_client_metadata");
    const uris = Array.from(new Set((input.redirect_uris as string[]).map(validateRedirectUri)));
    const clientId = "ccp_" + randomToken();
    const { error } = await createServiceClient().from("agent_oauth_clients").insert({
      id: clientId, name: input.client_name.trim(), redirect_uris: uris,
    });
    if (error) throw new Error("persistence_error");
    return NextResponse.json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now()/1000),
      client_name: input.client_name.trim(),
      redirect_uris: uris, token_endpoint_auth_method: "none",
      grant_types: ["authorization_code","refresh_token"],
      response_types: ["code"],
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" },
      {status:400, headers:{"Cache-Control":"no-store"}});
  }
}
