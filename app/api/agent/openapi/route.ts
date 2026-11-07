import { NextResponse } from "next/server";
import { exposedTools } from "@/lib/server/agent-tools";
import { resourceUri } from "@/lib/server/agent-oauth-core";

export const dynamic = "force-dynamic";
/**
 * A human/developer-friendly OpenAPI view generated from the SAME Zod tool
 * catalogue that serves MCP tools/list. The wire protocol remains JSON-RPC.
 */
export function GET() {
  try {
    return NextResponse.json({
      openapi: "3.1.0",
      info: { title: "ChessCoachPal MCP tools", version: "0.1.0-pre",
        description: "Stateless JSON-RPC MCP. Tools and input schemas are derived from the canonical Zod catalogue." },
      servers: [{ url: resourceUri().replace(/\/mcp$/,"") }],
      paths: {
        "/mcp": {
          post: {
            operationId: "callChessCoachPalTool",
            summary: "Discover or invoke a named MCP tool",
            security: [{ delegatedOAuth: [] }],
            requestBody: { required: true, content: { "application/json": { schema: {
              oneOf: exposedTools.map(tool => ({
                type: "object",
                required: ["jsonrpc","id","method","params"],
                properties: {
                  jsonrpc: {type:"string",const:"2.0"},
                  id: {oneOf:[{type:"string"},{type:"integer"}]},
                  method: {type:"string",const:"tools/call"},
                  params: {type:"object",required:["name","arguments"],properties:{
                    name: {type:"string",const:tool.name},
                    arguments: tool.inputSchema,
                  }},
                },
              })),
            } } } },
            responses: { "200": {description:"MCP JSON-RPC result, including structuredContent"},
              "401": {description:"OAuth protected resource discovery required"},
              "403": {description:"Insufficient scope or origin rejected"} },
          },
        },
      },
      components: {securitySchemes:{delegatedOAuth:{
        type:"oauth2",flows:{authorizationCode:{
          authorizationUrl: resourceUri().replace(/\/mcp$/,"") + "/oauth/authorize",
          tokenUrl: resourceUri().replace(/\/mcp$/,"") + "/oauth/token",
          scopes:{"coach:read":"Read teacher-owned records","coach:write":"Confirmed teacher-scoped writes"},
        }},
      }}},
      "x-mcp-tools": exposedTools,
    }, {headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"not_configured"},{status:503});
  }
}
