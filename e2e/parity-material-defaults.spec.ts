import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

async function workplace(call:(name:string,args:Record<string,unknown>)=>Promise<any>){
 const made=await call("ccp_v1_workplaces_create",{
  name:"Materials workplace "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 return made.data.entityId as string;
}
const url="https://lichess.org/study/AbCd1234";

test("PARITY:PARITY-workplaces-material-default-history creates, corrects and archives a study with durable history",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const workplaceId=await workplace(call);
 const body={operation:"default.create",workplaceId,
   label:"King-and-pawn endings",url,notes:"Study chapter 1",
   requestId:randomUUID(),confirmed:true};
 const created=await page.request.post("/api/coaching/materials",{data:body});
 expect(created.status(),await created.text()).toBe(201);
 const row=await created.json();
 const id=row.id as string;
 const site=await page.request.get("/api/coaching/materials?"+
   new URLSearchParams({defaults:"true",workplaceId}));
 expect(site.status()).toBe(200);
 const current=await site.json();
 const model=await call("ccp_v1_material_defaults_list",{workplaceId});
 expect(model.error).toBeUndefined();
 expect(model.data).toEqual(current);
 expect(model.data.defaults.some((x:{id:string})=>x.id===id)).toBe(true);
 const duplicate=await call("ccp_v1_material_default_create",{
   workplaceId,label:body.label,url,notes:body.notes,requestId:body.requestId,
   confirmed:true,
 });
 expect(duplicate.error).toBeUndefined();
 expect(duplicate.data).toMatchObject({id,replayed:true});
 const conflict=await call("ccp_v1_material_default_create",{
   workplaceId,label:"Changed duplicate",url,requestId:body.requestId,confirmed:true,
 });
 expect(conflict.error?.code).toBe("CONFLICT");
 const corrected=await call("ccp_v1_material_default_update",{
   defaultId:id,expectedUpdatedAt:row.updated_at,
   label:"Updated endings study",notes:"Use for groups or private lessons",
   confirmed:true,
 });
 expect(corrected.error).toBeUndefined();
 const revised=corrected.data.default;
 expect(revised.label).toBe("Updated endings study");
 const browser=await page.request.get("/api/coaching/materials?"+
   new URLSearchParams({defaults:"true",workplaceId}));
 expect(browser.status()).toBe(200);
 const read=await browser.json();
 expect(read.defaults.find((x:{id:string})=>x.id===id).label).toBe(revised.label);
 expect(read.history.filter((x:{default_id:string})=>x.default_id===id))
   .toHaveLength(2);
 const archived=await page.request.patch("/api/coaching/materials",{
   data:{operation:"default.archive",defaultId:id,
     expectedUpdatedAt:revised.updated_at,confirmed:true},
 });
 expect(archived.status(),await archived.text()).toBe(200);
 const hidden=await call("ccp_v1_material_defaults_list",{workplaceId});
 expect(hidden.error).toBeUndefined();
 expect(hidden.data.defaults.some((x:{id:string})=>x.id===id)).toBe(false);
 const historical=await call("ccp_v1_material_defaults_list",{
   workplaceId,includeArchived:true,
 });
 expect(historical.error).toBeUndefined();
 expect(historical.data.defaults.find((x:{id:string})=>x.id===id).archived_at)
   .toBeTruthy();
 expect(historical.data.history.filter((x:{default_id:string})=>x.default_id===id)
   .map((x:{action:string})=>x.action).sort()).toEqual([
     "archived","created","updated",
   ]);
 expect((await call("ccp_v1_material_defaults_list",{
   workplaceId:"00000000-0000-4000-8000-000000000001",
 })).error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-groups-default-study-scoped verifies official study link against workplace/group ownership",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const workplaceId=await workplace(call),otherWorkplaceId=await workplace(call);
 const group=await call("ccp_v1_groups_create",{
   workplaceId,name:"Beginners "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(group.error).toBeUndefined();
 const groupId=group.data.entityId as string;
 const payload={workplaceId,groupId,label:"Coach's default study",
   url:"https://lichess.org/study/AbCd1234/QwEr5678",
   notes:"Mate patterns and elementary tactics",requestId:randomUUID(),
   confirmed:true};
 const created=await call("ccp_v1_material_default_create",payload);
 expect(created.error).toBeUndefined();
 const id=created.data.id as string;
 const browser=await page.request.get("/api/coaching/materials?"+
   new URLSearchParams({defaults:"true",workplaceId,groupId}));
 expect(browser.status(),await browser.text()).toBe(200);
 expect((await browser.json()).defaults.find((x:{id:string})=>x.id===id).group_id)
   .toBe(groupId);
 const edited=await page.request.patch("/api/coaching/materials",{
   data:{operation:"default.update",defaultId:id,
     expectedUpdatedAt:created.data.updated_at,notes:"Focus on exercise 4",
     confirmed:true},
 });
 expect(edited.status(),await edited.text()).toBe(200);
 const viaMcp=await call("ccp_v1_material_defaults_list",{workplaceId,groupId});
 expect(viaMcp.error).toBeUndefined();
 expect(viaMcp.data.defaults.find((x:{id:string})=>x.id===id).notes)
   .toBe("Focus on exercise 4");
 const bad=await call("ccp_v1_material_default_create",{
   ...payload,workplaceId:otherWorkplaceId,requestId:randomUUID(),
 });
 expect(bad.error?.code).toBe("NOT_FOUND");
 const malicious=await page.request.post("/api/coaching/materials",{
   data:{...payload,url:"https://lichess.org.evil.example/study/AbCd1234",
     requestId:randomUUID()},
 });
 expect(malicious.status()).toBe(400);
 await page.goto("/coaching");
 const panel=page.locator('section[aria-label="Material learning history"]');
 await expect(panel).toBeVisible();
 await panel.getByLabel("Workplace (optional)").selectOption(workplaceId);
 const defaults=panel.locator('section[aria-label="Default lesson studies"]');
 await expect(defaults).toBeVisible();
 await defaults.getByLabel("Default study group").selectOption(groupId);
 await expect(defaults).toContainText("Coach's default study");
 await expect(defaults).toContainText("Focus on exercise 4");
});
