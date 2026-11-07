import { NextRequest, NextResponse } from "next/server";
import { authorizeBearer } from "@/lib/server/agent-oauth";
import { oauthOrigin } from "@/lib/server/agent-oauth-core";
import { exposedTools, runTool } from "@/lib/server/agent-tools";

export const dynamic = "force-dynamic";
const protocol = "2025-06-18";
function json(body: unknown, status = 200, headers: Record<string,string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
function unauthorized() {
  const resource = oauthOrigin() + "/.well-known/oauth-protected-resource";
  return json({ error: "unauthorized" }, 401, {
    "WWW-Authenticate": 'Bearer resource_metadata="' + resource + '", scope="coach:read coach:write"',
  });
}
function rpc(id: number | string | null, result?: unknown, error?: {code:number;message:string}) {
  return error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result };
}
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== oauthOrigin())
      return json({ error: "forbidden_origin" }, 403);
    const auth = await authorizeBearer(req.headers.get("authorization"));
    if (!auth) return unauthorized();
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      return json({ error: "json_required" }, 415);
    if (Number(req.headers.get("content-length") ?? 0) > 32_768)
      return json({ error: "payload_too_large" }, 413);
    const message = await req.json().catch(() => null);
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string" ||
        (message.id !== undefined && !(typeof message.id === "string" || Number.isSafeInteger(message.id))))
      return json(rpc(null, undefined, {code:-32600,message:"Invalid JSON-RPC request"}), 400);
    if (message.id === undefined) return new NextResponse(null, { status: 202 });
    const id = message.id;
    if (message.method === "initialize") return json(rpc(id, {
      protocolVersion: protocol,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ChessCoachPal", version: "0.1.0-pre" },
    }));
    if (message.method === "ping") return json(rpc(id, {}));
    if (message.method === "tools/list") return json(rpc(id, { tools:
      exposedTools.filter(t => auth.scopes.includes(
        t.annotations.readOnlyHint ? "coach:read" : "coach:write")) }));
    if (message.method === "tools/call") {
      const name = message.params?.name;
      if (typeof name !== "string") return json(rpc(id, undefined, {code:-32602,message:"Missing tool name"}));
      const result = await runTool(auth.db, auth.teacherId, name,
        message.params?.arguments ?? {}, auth.scopes);
      const failure = "error" in result;
      return json(rpc(id, { content: [{ type: "text", text: JSON.stringify(result) }],
        isError: failure, structuredContent: result }));
    }
    return json(rpc(id, undefined, {code:-32601,message:"Method not found"}));
  } catch {
    return json({ error: "server_unavailable" }, 503);
  }
}
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
