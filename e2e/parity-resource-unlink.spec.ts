import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-chess-resources-edit-unlink preserves authorizations and removes unused URLs",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Linked material student "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const made=await call("ccp_v1_chess_resources_link",{
   studentId,label:"Study URL "+randomUUID().slice(0,8),
   url:"https://lichess.org/study/AbCd1234",
   resourceType:"lichess_study",requestId:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 const resourceId=made.data.id as string;
 const browser=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.list",studentId,
 }});
 expect(browser.status(),await browser.text()).toBe(200);
 expect((await browser.json()).data.some((x:{id:string})=>x.id===resourceId)).toBe(true);
 const revised=await call("ccp_v1_chess_resources_update",{
   resourceId,label:"Revised by MCP",confirmed:true,
 });
 expect(revised.error).toBeUndefined();
 const siteList=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.list",studentId,
 }});
 expect(siteList.status()).toBe(200);
 expect((await siteList.json()).data.find((x:{id:string})=>x.id===resourceId)?.label)
   .toBe("Revised by MCP");
 const siteUpdate=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.update",resourceId,label:"Revised by website",
 }});
 expect(siteUpdate.status(),await siteUpdate.text()).toBe(200);
 const fromModel=await call("ccp_v1_chess_resources_list",{studentId});
 expect(fromModel.error).toBeUndefined();
 expect((fromModel.data as Array<{id:string;label:string}>)
   .find(x=>x.id===resourceId)?.label).toBe("Revised by website");
 const preview=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.unlinkImpact",resourceId,
 }});
 expect(preview.status(),await preview.text()).toBe(200);
 const impact=(await preview.json()).data as {canUnlink:boolean;claimCount:number};
 expect(impact).toMatchObject({canUnlink:true,claimCount:0});
 const mcpImpact=await call("ccp_v1_chess_resources_unlink_impact",{resourceId});
 expect(mcpImpact.data).toEqual(impact);
 const removed=await call("ccp_v1_chess_resources_unlink",{resourceId,confirmed:true});
 expect(removed.error).toBeUndefined();
 expect(removed.data.unlinked).toBe(true);
 const siteAfter=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.list",studentId,
 }});
 expect(siteAfter.status()).toBe(200);
 expect((await siteAfter.json()).data.some((x:{id:string})=>x.id===resourceId)).toBe(false);
 const second=await call("ccp_v1_chess_resources_link",{
   studentId,label:"Second study "+randomUUID().slice(0,8),
   url:"https://lichess.org/study/AbCd1234",
   resourceType:"lichess_study",requestId:randomUUID(),
 });
 expect(second.error).toBeUndefined();
 const secondId=second.data.id as string;
 const siteDelete=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.unlink",resourceId:secondId,confirmed:true,
 }});
 expect(siteDelete.status(),await siteDelete.text()).toBe(200);
 const after=await call("ccp_v1_chess_resources_list",{studentId});
 expect((after.data as Array<{id:string}>).some(x=>x.id===secondId)).toBe(false);
});

test("PARITY:PARITY-chess-resources-retention keeps typed material history after URL unlink",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=(await call("ccp_v1_students_create",{
   name:"Learning history "+randomUUID(),idempotencyKey:randomUUID(),
 })).data as {entityId:string};
 const workplace=(await call("ccp_v1_workplaces_create",{
   name:"Material retention "+randomUUID(),
   timezone:"UTC",currency:"USD",locale:"en",policy:{},
   idempotencyKey:randomUUID(),
 })).data as {entityId:string};
 expect((await call("ccp_v1_workplaces_enroll",{
   workplaceId:workplace.entityId,studentId:student.entityId,
   idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const resource=await call("ccp_v1_chess_resources_link",{
   studentId:student.entityId,label:"Retention study "+randomUUID(),
   url:"https://lichess.org/study/AbCd1234",resourceType:"lichess_study",
   requestId:randomUUID(),
 });
 expect(resource.error).toBeUndefined();
 const resourceId=resource.data.id as string;
 const material=await call("ccp_v1_learning_materials_create",{
   kind:"study_chapter",title:"Retention study "+randomUUID(),
   description:"",sourceUrl:"https://lichess.org/study/AbCd1234",
   details:{provider:"lichess",studyId:"AbCd1234",chapterId:null},
   requestId:randomUUID(),
 });
 expect(material.error).toBeUndefined();
 const materialId=material.data.material.id as string;
 const claim=await call("ccp_v1_materials_history_record",{
   studentId:student.entityId,workplaceId:workplace.entityId,
   materialId,stage:"taught",occurredOn:"2027-04-01",
   note:"Historical study evidence",requestId:randomUUID(),confirmed:true,
 });
 expect(claim.error).toBeUndefined();
 const site=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.unlinkImpact",resourceId,
 }});
 expect(site.status(),await site.text()).toBe(200);
 expect((await site.json()).data).toMatchObject({canUnlink:true,claimCount:0});
 const removed=await call("ccp_v1_chess_resources_unlink",{
   resourceId,confirmed:true,
 });
 expect(removed.error).toBeUndefined();
 expect(removed.data.unlinked).toBe(true);
 const ledger=await call("ccp_v1_materials_history_list",{
   studentId:student.entityId,workplaceId:workplace.entityId,
 });
 expect(ledger.error).toBeUndefined();
 expect(ledger.data.entries.some((x:{id:string})=>x.id===claim.data.id)).toBe(true);
});
