import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

async function web<T>(page:import("@playwright/test").Page,action:string,
 args:Record<string,unknown>={}):Promise<T>{
 const r=await page.request.post("/api/agent/v1",{data:{action,...args}});
 expect(r.status(),await r.text()).toBe(200);
 return (await r.json()).data as T;
}

test("PARITY:PARITY-coach-workplace-group-revision-replay preserves one receipt across website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const made=await call("ccp_v1_workplaces_create",{
  name:"Revisioned chess academy "+randomUUID().slice(0,8),
  timezone:"UTC",currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 const workplaceId=made.data.entityId as string;
 const original=(await web<Array<{id:string;updated_at:string;name:string}>>(page,
  "workplaces.list")).find(x=>x.id===workplaceId)!;
 expect(original).toBeDefined();

 const input={
  workplaceId,name:"Coaching academy revision "+randomUUID().slice(0,7),
  timezone:"Europe/London",currency:"GBP",locale:"en",
  policy:{coachSpecialty:"Chess"},expectedUpdatedAt:original.updated_at,
  idempotencyKey:randomUUID(),
 };
 const browser=await web<{entityId:string;revision:string}>(page,"workplaces.update",input);
 expect(browser.entityId).toBe(workplaceId);
 const replay=await call("ccp_v1_workplaces_update",input);
 expect(replay.error).toBeUndefined();
 expect(replay.data).toEqual(browser);
 const found=(await call("ccp_v1_workplaces_list",{})).data as Array<{
  id:string;name:string;timezone:string;updated_at:string;policy:Record<string,string>;
 }>;
 expect(found.find(x=>x.id===workplaceId)).toMatchObject({
  name:input.name,timezone:input.timezone,policy:input.policy,
  updated_at:browser.revision,
 });

 const reused=await call("ccp_v1_workplaces_update",{
  ...input,name:"Different payload with the same request key",
 });
 expect(reused.error?.code).toBe("CONFLICT");
 const stale=await page.request.post("/api/agent/v1",{data:{
  action:"workplaces.update",...input,name:"Stale revised title",
  idempotencyKey:randomUUID(),
 }});
 expect(stale.status(),await stale.text()).toBe(409);

 const groupMade=await call("ccp_v1_groups_create",{
  workplaceId,name:"Frozen knight class "+randomUUID().slice(0,6),
  idempotencyKey:randomUUID(),
 });
 expect(groupMade.error).toBeUndefined();
 const groupId=groupMade.data.entityId as string;
 const groups=await web<Array<{id:string;updated_at:string}>>(page,"groups.list");
 const group=groups.find(g=>g.id===groupId)!;
 expect(group).toBeDefined();
 const groupInput={groupId,workplaceId,name:"Queen endgames "+randomUUID().slice(0,6),
  expectedUpdatedAt:group.updated_at,idempotencyKey:randomUUID()};
 const byMcp=await call("ccp_v1_groups_update",groupInput);
 expect(byMcp.error).toBeUndefined();
 const byBrowser=await web<{
  entityId:string;revision:string;
 }>(page,"groups.update",groupInput);
 expect(byBrowser).toEqual(byMcp.data);
 const webGroups=await web<Array<{id:string;name:string;updated_at:string}>>(page,"groups.list");
 expect(webGroups.find(g=>g.id===groupId)).toMatchObject({
  name:groupInput.name,updated_at:byMcp.data.revision,
 });
 const badKey=await page.request.post("/api/agent/v1",{data:{
  action:"groups.update",...groupInput,name:"Changed key reuse",
 }});
 expect(badKey.status(),await badKey.text()).toBe(409);
 const invalid=await page.request.post("/api/agent/v1",{data:{
  action:"groups.update",groupId,workplaceId,name:"Unreviewed overwrite",
 }});
 expect(invalid.status(),await invalid.text()).toBe(400);
});
