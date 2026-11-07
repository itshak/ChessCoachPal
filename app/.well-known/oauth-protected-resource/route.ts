import { NextResponse } from "next/server";
import { oauthOrigin, resourceUri } from "@/lib/server/agent-oauth-core";

export function GET() {
  try {
    return NextResponse.json({
      resource: resourceUri(),
      authorization_servers: [oauthOrigin()],
      bearer_methods_supported: ["header"],
      scopes_supported: ["coach:read", "coach:write"],
    }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({error:"not_configured"}, {status:503});
  }
}
