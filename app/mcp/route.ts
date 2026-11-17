import { NextRequest, NextResponse } from "next/server";
import { authorizeBearer } from "@/lib/server/agent-oauth";
import { oauthOrigin } from "@/lib/server/agent-oauth-core";
import { exposedTools, runTool, toolScopeByName } from "@/lib/server/agent-tools";
import packageJson from "@/package.json";

export const dynamic = "force-dynamic";
const protocol = "2025-06-18";
// The historical import accepts 250 rows/256 KiB; OAuth JSON-RPC framing
// also has overhead. Never advertise a tool payload larger than the gateway.
const MAX_MCP_REQUEST_BYTES = 320*1024;
async function boundedJson(req: NextRequest){
 const reader=req.body?.getReader();
 if(!reader)return {value:null,tooLarge:false};
 const chunks:Buffer[]=[];
 let bytes=0;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  bytes+=value.byteLength;
  if(bytes>MAX_MCP_REQUEST_BYTES){
   await reader.cancel();
   return {value:null,tooLarge:true};
  }
  chunks.push(Buffer.from(value));
 }
 try{return {value:JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,tooLarge:false};}
 catch{return {value:null,tooLarge:false};}
}
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
    if (Number(req.headers.get("content-length") ?? 0) > MAX_MCP_REQUEST_BYTES)
      return json({ error: "payload_too_large" }, 413);
    const decoded=await boundedJson(req);
    if(decoded.tooLarge)return json({error:"payload_too_large"},413);
    const message=decoded.value as {jsonrpc?:string;method?:string;id?:string|number|null;
      params?:{name?:unknown;arguments?:unknown}}|null;
    if (!message || typeof message!=="object"|| message.jsonrpc !== "2.0" || typeof message.method !== "string" ||
        (message.id !== undefined && !(typeof message.id === "string" || Number.isSafeInteger(message.id))))
      return json(rpc(null, undefined, {code:-32600,message:"Invalid JSON-RPC request"}), 400);
    if (message.id === undefined) return new NextResponse(null, { status: 202 });
    const id = message.id as string | number;
    if (message.method === "initialize") return json(rpc(id, {
      protocolVersion: protocol,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ChessCoachPal", version: packageJson.version },
      instructions: "ChessCoachPal manages teacher-owned students, lessons, materials, scheduling, learning history, exports and reports. Reply in the latest explicit user message language (English, Hebrew or Russian); otherwise use preferredLocale from ccp_teacher_context_get. Keep workplace/recipient languages independent; never translate MCP tool names, arguments, identity, records, quantities, FEN/PGN or dates. Resolve ambiguous names and times, confirm consequential changes and read back receipts. For completed group lessons use ccp_lessons_capture_preview then ccp_lessons_capture_completed; scheduling alone uses ccp_sessions_ad_hoc_create. For lesson material use ccp_materials_lesson_use_preview and _commit. Historical attendance dates are evidence, NOT calendar lessons. Use ccp_historical_attendance_dates_preview and _commit only for verified dates and a validated workplace; never infer attendance from spreadsheet symbols, blanks or totals. Use advanced import for mixed sources and distinct student/family import tools. Use ccp_settings_export_csv for paginated CSV; the authenticated website offers full CSV ZIP and JSON backup/restore. Never invent mastery, billing, attendance, dates or persisted success.",
    }));
    if (message.method === "ping") return json(rpc(id, {}));
    if (message.method === "tools/list") return json(rpc(id, { tools:
      exposedTools.filter(t => auth.scopes.includes(
        toolScopeByName.get(t.name) ?? "")) }));
    if (message.method === "tools/call") {
      const name = message.params?.name;
      if (typeof name !== "string") return json(rpc(id, undefined, {code:-32602,message:"Missing tool name"}));
      const result = await runTool(auth.db, auth.teacherId, name,
        message.params?.arguments ?? {}, auth.scopes, auth.clientId);
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
