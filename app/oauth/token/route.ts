import { NextRequest, NextResponse } from "next/server";
import { clientById, exchangeCode, refreshGrant } from "@/lib/server/agent-oauth";
import { resourceUri, validateRedirectUri } from "@/lib/server/agent-oauth-core";

export const dynamic = "force-dynamic";
function reply(data:unknown, status=200) {
  return NextResponse.json(data,{status,headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});
}
export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded") ||
      Number(req.headers.get("content-length") ?? 0) > 8192) return reply({error:"invalid_request"},400);
  const body = new URLSearchParams(await req.text());
  const clientId = body.get("client_id") ?? "";
  const resource = body.get("resource") ?? "";
  if (resource !== resourceUri() || !(await clientById(clientId))) return reply({error:"invalid_grant"},400);
  if (body.get("grant_type") === "authorization_code") {
    try {
      const token = await exchangeCode({
        code: body.get("code") ?? "", clientId, resource,
        verifier: body.get("code_verifier") ?? "",
        redirectUri: validateRedirectUri(body.get("redirect_uri") ?? ""),
      });
      return token ? reply(token) : reply({error:"invalid_grant"},400);
    } catch { return reply({error:"invalid_grant"},400); }
  }
  if (body.get("grant_type") === "refresh_token") {
    const token = await refreshGrant(body.get("refresh_token") ?? "", clientId, resource);
    return token ? reply(token) : reply({error:"invalid_grant"},400);
  }
  return reply({error:"unsupported_grant_type"},400);
}
