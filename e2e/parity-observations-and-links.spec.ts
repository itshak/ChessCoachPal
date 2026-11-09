import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-chess-observations-read compares teacher-owned historical observations on both surfaces",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Observation history "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const categories=(await call("ccp_v1_chess_categories_list",{})).data as Array<{id:string}>;
 expect(categories.length).toBeGreaterThan(0);
 const created=await call("ccp_v1_chess_observations_propose",{
   studentId,categoryId:categories[0].id,
   observation:"Unverified tactical theme "+randomUUID(),
   requestId:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const web=await page.request.post("/api/agent/v1",{data:{
   action:"chess.observations.list",studentId,
 }});
 expect(web.status(),await web.text()).toBe(200);
 const website=(await web.json()).data as Array<{id:string;source:string}>;
 expect(website.some(x=>x.id===created.data.id)).toBe(true);
 const mcp=await call("ccp_v1_chess_observations_list",{studentId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(website);
});

test("PARITY:PARITY-chess-observations-proposal remains unverified until explicit browser approval",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=(await call("ccp_v1_students_create",{
   name:"Unverified learner "+randomUUID(),idempotencyKey:randomUUID(),
 })).data as {entityId:string};
 const categories=(await call("ccp_v1_chess_categories_list",{})).data as Array<{id:string}>;
 const categoryId=categories[0].id;
 const suggestion=await call("ccp_v1_chess_observations_propose",{
   studentId:student.entityId,categoryId,observation:"Needs verification",
   requestId:randomUUID(),
 });
 expect(suggestion.error).toBeUndefined();
 expect(suggestion.data.verified_at).toBeNull();
 expect(suggestion.data.source).toBe("agent");
 const web=await page.request.post("/api/agent/v1",{data:{
   action:"chess.observations.list",studentId:student.entityId,
 }});
 expect(web.status(),await web.text()).toBe(200);
 const siteRow=(await web.json()).data.find((x:{id:string})=>x.id===suggestion.data.id);
 expect(siteRow.verified_at).toBeNull();
 const browserProposal=await page.request.post("/api/agent/v1",{data:{
   action:"chess.observations.propose",studentId:student.entityId,
   categoryId,observation:"Browser-created unverified draft",
   requestId:randomUUID(),
 }});
 expect(browserProposal.status(),await browserProposal.text()).toBe(200);
 expect((await browserProposal.json()).data.verified_at).toBeNull();
 const mcp=await call("ccp_v1_chess_observations_list",{studentId:student.entityId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data.filter((x:{verified_at:string|null})=>x.verified_at===null))
   .toHaveLength(2);
});

test("PARITY:PARITY-chess-resources-list enumerates saved HTTPS and Lichess references without fetching content",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const made=await call("ccp_v1_students_create",{
   name:"Study URL student "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 const studentId=made.data.entityId as string;
 const linked=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.link",studentId,
   label:"Endgame study "+randomUUID(),url:"https://lichess.org/study/AbCd1234",
   resourceType:"lichess_study",requestId:randomUUID(),
 }});
 expect(linked.status(),await linked.text()).toBe(200);
 const resourceId=(await linked.json()).data.id as string;
 const mcp=await call("ccp_v1_chess_resources_list",{studentId});
 expect(mcp.error).toBeUndefined();
 expect((mcp.data as Array<{id:string}>).some(x=>x.id===resourceId)).toBe(true);
 const browser=await page.request.post("/api/agent/v1",{data:{
   action:"chess.resources.list",studentId,
 }});
 expect(browser.status(),await browser.text()).toBe(200);
 expect(mcp.data).toEqual((await browser.json()).data);
 expect((mcp.data as Array<{id:string;url:string}>)
   .find(x=>x.id===resourceId)?.url).toBe("https://lichess.org/study/AbCd1234");
});
