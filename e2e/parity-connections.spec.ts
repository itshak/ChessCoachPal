import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

/** Standalone website/MCP grant-parity proof. The wider agent smoke suite
 * additionally tests access-token invalidation, scope enforcement and refresh. */
test("PARITY:PARITY-connections-grants compares redacted browser/MCP grants and confirmed revocation",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const first=await page.request.get("/api/agent/connections");
 expect(first.status(),await first.text()).toBe(200);
 const website=(await first.json()).connections as Array<{id:string;client_id:string}>;
 const grant=website.find(g=>g.client_id===call.clientId);
 expect(grant).toBeTruthy();
 const mcp=await call("ccp_v1_connections_list",{});
 expect(mcp.error).toBeUndefined();
 const rows=mcp.data.connections as Array<{
   id:string;client_id:string;access_token?:string;refresh_token?:string;
 }>;
 expect(rows.find(g=>g.id===grant!.id)?.client_id).toBe(call.clientId);
 expect(rows.every(g=>!g.access_token&&!g.refresh_token)).toBe(true);

 // Revoke only this scenario's new synthetic grant, never shared seed data.
 const revoked=await call("ccp_v1_connections_revoke",{
   connectionId:grant!.id,confirmed:true,
 });
 expect(revoked.error).toBeUndefined();
 const after=await page.request.get("/api/agent/connections");
 expect(after.status(),await after.text()).toBe(200);
 const active=(await after.json()).connections as Array<{id:string}>;
 expect(active.some(g=>g.id===grant!.id)).toBe(false);
 // Do not compare unrelated grants: other Playwright workers can create
 // their own OAuth connections while this scenario executes.
});
