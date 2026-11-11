import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-chess-categories-lifecycle creates renames reorders and safely deletes unused categories",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const label="New tactics theme "+randomUUID().slice(0,8);
 const created=await call("ccp_v1_chess_categories_create",{
   name:label,description:"Synthetic lesson skill",sortOrder:88,confirmed:true,
 });
 expect(created.error).toBeUndefined();
 const id=created.data.id as string;
 const web=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.list",
 }});
 expect(web.status(),await web.text()).toBe(200);
 expect((await web.json()).data.some((x:{id:string})=>x.id===id)).toBe(true);
 const websiteRename=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.update",categoryId:id,
   name:label+" revised",sortOrder:89,
 }});
 expect(websiteRename.status(),await websiteRename.text()).toBe(200);
 expect(((await call("ccp_v1_chess_categories_list",{})).data as Array<{
   id:string;name:string;sort_order:number;
 }>).find(x=>x.id===id)).toMatchObject({
   name:label+" revised",sort_order:89,
 });
 const preview=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.deleteImpact",categoryId:id,
 }});
 expect(preview.status(),await preview.text()).toBe(200);
 const impact=(await preview.json()).data as {
   categoryId:string;observationCount:number;canDelete:boolean;
 };
 const mcpImpact=await call("ccp_v1_chess_categories_delete_impact",{categoryId:id});
 expect(mcpImpact.error).toBeUndefined();
 expect(mcpImpact.data).toEqual(impact);
 expect(impact).toMatchObject({categoryId:id,observationCount:0,canDelete:true});
 const deleted=await call("ccp_v1_chess_categories_delete",{categoryId:id,confirmed:true});
 expect(deleted.error).toBeUndefined();
 expect(deleted.data.deleted).toBe(true);
 const after=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.list",
 }});
 expect(after.status(),await after.text()).toBe(200);
 expect((await after.json()).data.some((x:{id:string})=>x.id===id)).toBe(false);
 const second=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.create",name:label+" second",
   description:"Used by website",sortOrder:91,
 }});
 expect(second.status(),await second.text()).toBe(201);
 const secondId=(await second.json()).data.id as string;
 const siteRemove=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.delete",categoryId:secondId,confirmed:true,
 }});
 expect(siteRemove.status(),await siteRemove.text()).toBe(200);
 expect(((await call("ccp_v1_chess_categories_list",{})).data as Array<{id:string}>)
   .some(x=>x.id===secondId)).toBe(false);
});

test("PARITY:PARITY-chess-categories-delete-protected preserves teacher observation history",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Category history learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const category=await call("ccp_v1_chess_categories_create",{
   name:"History-dependent skill "+randomUUID(),
   description:"Do not erase",sortOrder:93,confirmed:true,
 });
 expect(category.error).toBeUndefined();
 const categoryId=category.data.id as string;
 const observation=await call("ccp_v1_chess_observations_propose",{
   studentId,categoryId,observation:"Observed pawn-structure understanding",
   requestId:randomUUID(),
 });
 expect(observation.error).toBeUndefined();
 const web=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.deleteImpact",categoryId,
 }});
 expect(web.status(),await web.text()).toBe(200);
 const impact=(await web.json()).data as {
   canDelete:boolean;observationCount:number;
 };
 expect(impact.canDelete).toBe(false);
 expect(impact.observationCount).toBeGreaterThan(0);
 const refused=await call("ccp_v1_chess_categories_delete",{
   categoryId,confirmed:true,
 });
 expect(refused.error?.code).toBe("CONFLICT");
 const browserRefused=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.delete",categoryId,confirmed:true,
 }});
 expect(browserRefused.status()).toBe(409);
 const retained=await call("ccp_v1_chess_observations_list",{studentId});
 expect(retained.error).toBeUndefined();
 expect((retained.data as Array<{id:string}>).some(x=>x.id===observation.data.id))
   .toBe(true);
});
