import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

/** A dedicated OAuth/browser acceptance case; the larger agent smoke test
 * also checks token invalidation, refresh rotation and read-only scopes. */
test("PARITY:PARITY-connections-grants compares redacted browser/MCP grants and confirmed revocation",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const first=await page.request.get("/api/agent/connections");
 expect(first.status(),await first.text()).toBe(200);
 const before=(await first.json()).connections as Array<{id:string;client_id:string}>;
 expect(before.length).toBeGreaterThan(0);
 const fromMcp=await call("ccp_v1_connections_list",{});
 expect(fromMcp.error).toBeUndefined();
 const mcpRows=fromMcp.data.connections as Array<{
   id:string;client_id:string;access_token?:string;refresh_token?:string;
 }>;
 expect(mcpRows.map(g=>g.id).sort()).toEqual(before.map(g=>g.id).sort());
 expect(mcpRows.every(g=>!g.access_token&&!g.refresh_token)).toBe(true);

 // Create a distinct synthetic grant so the test never revokes a seed or
 // another test's grant, then compare the web inventory to MCP again.
 await delegatedTool(page,request);
 const another=await page.request.get("/api/agent/connections");
 expect(another.status(),await another.text()).toBe(200);
 const newList=(await another.json()).connections as Array<{id:string;client_id:string}>;
 const originalIds=new Set(before.map(g=>g.id));
 const additional=newList.filter(g=>!originalIds.has(g.id));
 expect(additional).toHaveLength(1);
 const grant=additional[0];
 const mcpAfter=await call("ccp_v1_connections_list",{});
 expect(mcpAfter.error).toBeUndefined();
 expect((mcpAfter.data.connections as Array<{id:string}>).map(g=>g.id).sort())
   .toEqual(newList.map(g=>g.id).sort());

 const revoked=await call("ccp_v1_connections_revoke",{
   connectionId:grant.id,confirmed:true,
 });
 expect(revoked.error).toBeUndefined();
 const siteAfter=await page.request.get("/api/agent/connections");
 expect(siteAfter.status(),await siteAfter.text()).toBe(200);
 const active=(await siteAfter.json()).connections as Array<{id:string}>;
 expect(active.some(g=>g.id===grant.id)).toBe(false);
 expect(active.some(g=>g.id===before[0].id)).toBe(true);
});
