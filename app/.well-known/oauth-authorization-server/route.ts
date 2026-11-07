import { NextResponse } from "next/server";
import { oauthOrigin } from "@/lib/server/agent-oauth-core";

export function GET() {
  try {
    const origin = oauthOrigin();
    return NextResponse.json({
      issuer: origin,
      authorization_endpoint: origin + "/oauth/authorize",
      token_endpoint: origin + "/oauth/token",
      registration_endpoint: origin + "/oauth/register",
      revocation_endpoint: origin + "/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["coach:read", "coach:write"],
      resource_indicators_supported: true,
    }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
}
