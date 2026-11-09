import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

async function firstStudent(page:import("@playwright/test").Page){
 const r=await page.request.get("/api/students?limit=1");
 expect(r.status()).toBe(200);
 const id=(await r.json()).students[0]?.id as string;
 expect(id).toMatch(/^[0-9a-f-]{36}$/);
 return id;
}

test("PARITY:PARITY-chess-categories compares configuration create rename and reorder",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const label="MCP skill "+randomUUID().slice(0,8);
 const created=await callTool("ccp_v1_chess_categories_create",{
   name:label,description:"Synthetic skill",sortOrder:91,confirmed:true,
 });
 expect(created.error).toBeUndefined();
 const id=(created.data as {id:string}).id;
 const website=await page.request.post("/api/agent/v1",{data:{action:"chess.categories.list"}});
 expect(website.status()).toBe(200);
 const rows=(await website.json()).data as Array<{id:string;name:string;sort_order:number}>;
 expect(rows.some(row=>row.id===id&&row.name===label)).toBe(true);
 expect((await callTool("ccp_v1_chess_categories_list",{})).data).toEqual(rows);
 const corrected=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.update",categoryId:id,name:label+" revised",sortOrder:92,
 }});
 expect(corrected.status()).toBe(200);
 const mcpNow=(await callTool("ccp_v1_chess_categories_list",{})).data as
  Array<{id:string;name:string;sort_order:number}>;
 expect(mcpNow.find(x=>x.id===id)).toMatchObject({name:label+" revised",sort_order:92});
 const mcpcorrected=await callTool("ccp_v1_chess_categories_update",{
   categoryId:id,description:"MCP corrected",confirmed:true,
 });
 expect(mcpcorrected.error).toBeUndefined();
 const siteNow=await page.request.post("/api/agent/v1",{data:{action:"chess.categories.list"}});
 expect((await siteNow.json()).data).toEqual((await callTool("ccp_v1_chess_categories_list",{})).data);
});

test("PARITY:PARITY-chess-observations requires actual browser-only teacher approval",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const studentId=await firstStudent(page);
 const categories=(await callTool("ccp_v1_chess_categories_list",{})).data as Array<{id:string}>;
 expect(categories.length).toBeGreaterThan(0);
 const proposed=await callTool("ccp_v1_chess_observations_propose",{
   studentId,categoryId:categories[0].id,
   observation:"Synthetic unverified endgame insight "+randomUUID(),
   requestId:randomUUID(),
 });
 expect(proposed.error).toBeUndefined();
 const value=proposed.data as {id:string;verified_at:string|null;source:string};
 expect(value.source).toBe("agent");
 expect(value.verified_at).toBeNull();
 const websiteBefore=await page.request.post("/api/agent/v1",{data:{
   action:"chess.observations.list",studentId,
 }});
 expect(websiteBefore.status()).toBe(200);
 expect(((await websiteBefore.json()).data as Array<{id:string;verified_at:string|null}>)
   .find(x=>x.id===value.id)?.verified_at).toBeNull();
 const corrected=await callTool("ccp_v1_chess_observations_update",{
   observationId:value.id,observation:"Teacher-reviewed candidate "+randomUUID(),confirmed:true,
 });
 expect(corrected.error).toBeUndefined();
 const approved=await page.request.post("/api/agent/v1",{data:{
   action:"chess.observations.approve",observationId:value.id,
 }});
 expect(approved.status(),await approved.text()).toBe(200);
 const webApproved=(await approved.json()).data as {verified_at:string};
 expect(webApproved.verified_at).toBeTruthy();
 const readMcp=(await callTool("ccp_v1_chess_observations_list",{
   studentId,
 })).data as Array<{id:string;verified_at:string;verified_by:string}>;
 expect(readMcp.find(x=>x.id===value.id)?.verified_at).toBeTruthy();
 const siteList=await page.request.post("/api/agent/v1",{data:{
   action:"chess.observations.list",studentId,
 }});
 expect((await siteList.json()).data).toEqual(readMcp);
});

test("PARITY:PARITY-chess-resources validates trusted HTTPS links on both transports",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const studentId=await firstStudent(page);
 const url="https://lichess.org/study/AbCd1234/QwEr5678";
 const resource=await callTool("ccp_v1_chess_resources_link",{
   studentId,label:"Synthetic study "+randomUUID().slice(0,8),
   url,resourceType:"lichess_study",requestId:randomUUID(),
 });
 expect(resource.error).toBeUndefined();
 const id=(resource.data as {id:string}).id;
 const browserList=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.list",studentId,
 }});
 expect(browserList.status()).toBe(200);
 const rows=(await browserList.json()).data as Array<{id:string;provider_chapter_id:string}>;
 expect(rows.find(x=>x.id===id)?.provider_chapter_id).toBe("QwEr5678");
 expect((await callTool("ccp_v1_chess_resources_list",{studentId})).data).toEqual(rows);
 const editMcp=await callTool("ccp_v1_chess_resources_update",{
   resourceId:id,label:"Corrected study",confirmed:true,
 });
 expect(editMcp.error).toBeUndefined();
 const editSite=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.update",resourceId:id,label:"Website corrected",
 }});
 expect(editSite.status()).toBe(200);
 const rowsAfter=(await callTool("ccp_v1_chess_resources_list",{studentId})).data as
  Array<{id:string;label:string}>;
 expect(rowsAfter.find(x=>x.id===id)?.label).toBe("Website corrected");
 const hostile="https://lichess.org.attacker.example/study/AbCd1234";
 const refusedMcp=await callTool("ccp_v1_chess_resources_link",{
   studentId,label:"Fake",url:hostile,resourceType:"lichess_study",
 });
 expect(refusedMcp.error).toBeDefined();
 const refusedSite=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.link",studentId,label:"Fake",
   url:hostile,resourceType:"lichess_study",
 }});
 expect(refusedSite.status()).toBe(400);
});
