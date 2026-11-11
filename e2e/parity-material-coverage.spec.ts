import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

type Tool=(name:string,args:Record<string,unknown>)=>Promise<{
 data?:any;error?:{code:string;message:string};
}>;
async function fixture(call:Tool,hour:number){
 const suffix=randomUUID().slice(0,8);
 const w=await call("ccp_v1_workplaces_create",{
   name:"Coverage "+suffix,timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",
   policy:{},idempotencyKey:randomUUID(),
 });
 expect(w.error).toBeUndefined();
 const workplaceId=w.data.entityId as string;
 const group=await call("ccp_v1_groups_create",{
   workplaceId,name:"Coverage group "+suffix,idempotencyKey:randomUUID(),
 });
 expect(group.error).toBeUndefined();
 const studentIds:string[]=[];
 for(let i=0;i<2;i++){
   const m=await call("ccp_v1_students_create",{
     name:"Coverage תלמיד "+i+" "+suffix,idempotencyKey:randomUUID(),
   });
   expect(m.error).toBeUndefined();
   const studentId=m.data.entityId as string;
   studentIds.push(studentId);
   const enrolled=await call("ccp_v1_groups_enroll",{
     groupId:group.data.entityId,studentId,idempotencyKey:randomUUID(),
   });
   expect(enrolled.error).toBeUndefined();
 }
 const made=await call("ccp_v1_sessions_create",{
   workplaceId,groupId:group.data.entityId,
   title:"Endgame coverage "+suffix,startsAt:"2041-03-01T"+String(hour).padStart(2,"0")+":00:00+02:00",
   durationMinutes:60,lessonNote:"Two pupils, one instructor session",
   idempotencyKey:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 const sessionId=made.data.entityId as string;
 const linked=await call("ccp_v1_chess_resources_link",{
   sessionId,label:"King and pawn "+suffix,
   url:"https://lichess.org/study/AbCd1234",
   resourceType:"lichess_study",requestId:randomUUID(),
 });
 expect(linked.error).toBeUndefined();
 return {workplaceId,groupId:group.data.entityId as string,studentIds,
   sessionId,resourceId:linked.data.id as string};
}
async function claim(call:Tool,ctx:Awaited<ReturnType<typeof fixture>>,
 studentId:string,stage:"assigned"|"taught"|"completed"){
 const result=await call("ccp_v1_materials_history_record",{
   studentId,resourceId:ctx.resourceId,sessionId:ctx.sessionId,
   workplaceId:ctx.workplaceId,stage,occurredOn:"2041-03-01",
   note:"Teacher-confirmed "+stage,requestId:randomUUID(),confirmed:true,
 });
 expect(result.error).toBeUndefined();
 return result.data;
}
async function webMaterials(page:Page,opts:Record<string,string>){
 const result=await page.request.get("/api/coaching/materials?"+new URLSearchParams(opts));
 expect(result.status(),await result.text()).toBe(200);
 return await result.json();
}

test("PARITY:PARITY-materials-student-history enumerates explicitly taught student lessons by date",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ctx=await fixture(call,8);
 await claim(call,ctx,ctx.studentIds[0],"assigned");
 const taught=await claim(call,ctx,ctx.studentIds[0],"taught");
 const filters={studentId:ctx.studentIds[0],from:"2041-03-01",to:"2041-03-01"};
 const browserResponse=await page.request.get("/api/coaching/materials?"+
   new URLSearchParams(filters));
 expect(browserResponse.status(),await browserResponse.text()).toBe(200);
 const browser=await browserResponse.json();
 const mcp=await call("ccp_v1_materials_history_list",filters);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(browser);
 expect(browser.total).toBe(2);
 expect(browser.entries.map((e:{id:string})=>e.id)).toContain(taught.id);
 expect(browser.entries.map((e:{stage:string})=>e.stage).sort())
   .toEqual(["assigned","taught"]);
 expect(browser.truthBasis).toBe("explicit_teacher_record_only");
});

test("PARITY:PARITY-materials-workplace deduplicates group lesson studies in full aggregates",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ctx=await fixture(call,10);
 for(const studentId of ctx.studentIds)await claim(call,ctx,studentId,"taught");
 const query={workplaceId:ctx.workplaceId,from:"2041-03-01",to:"2041-03-01"};
 const browserResponse=await page.request.get("/api/coaching/materials?"+
   new URLSearchParams({...query,aggregate:"true"}));
 expect(browserResponse.status(),await browserResponse.text()).toBe(200);
 const browser=await browserResponse.json();
 const mcp=await call("ccp_v1_materials_aggregate",query);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(browser);
 expect(browser.evidenceClaims).toBe(2);
 expect(browser.studentCount).toBe(2);
 expect(browser.sessionCount).toBe(1);
 expect(browser.uniqueSessionMaterialStageCount).toBe(1);
 expect(browser.stages).toEqual({assigned:0,taught:2,completed:0});
});

test("PARITY:PARITY-materials-stage-reconciliation never invents learned or completed status",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ctx=await fixture(call,12);
 const studentId=ctx.studentIds[0];
 await claim(call,ctx,studentId,"assigned");
 const filters={studentId,workplaceId:ctx.workplaceId,
   from:"2041-03-01",to:"2041-03-01"};
 const assignedResponse=await page.request.get("/api/coaching/materials?"+
   new URLSearchParams({...filters,aggregate:"true"}));
 expect(assignedResponse.status(),await assignedResponse.text()).toBe(200);
 const assigned=await assignedResponse.json();
 expect(assigned.stages).toEqual({assigned:1,taught:0,completed:0});
 const mcpAssigned=await call("ccp_v1_materials_aggregate",filters);
 expect(mcpAssigned.data).toEqual(assigned);
 await claim(call,ctx,studentId,"taught");
 const afterTeaching=await webMaterials(page,{...filters,aggregate:"true"});
 expect(afterTeaching.stages).toEqual({assigned:1,taught:1,completed:0});
 await claim(call,ctx,studentId,"completed");
 const all=await call("ccp_v1_materials_aggregate",filters);
 const browser=await webMaterials(page,{...filters,aggregate:"true"});
 expect(all.data).toEqual(browser);
 expect(browser.stages).toEqual({assigned:1,taught:1,completed:1});
});

test("PARITY:PARITY-materials-workplace-student-report distinguishes individual from whole-class claims",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ctx=await fixture(call,14);
 await claim(call,ctx,ctx.studentIds[0],"taught");
 await claim(call,ctx,ctx.studentIds[1],"assigned");
 const wp={workplaceId:ctx.workplaceId,from:"2041-03-01",to:"2041-03-01"};
 const websiteResponse=await page.request.get("/api/coaching/materials?"+
   new URLSearchParams({...wp,aggregate:"true"}));
 expect(websiteResponse.status(),await websiteResponse.text()).toBe(200);
 const website=await websiteResponse.json();
 const mcp=await call("ccp_v1_materials_aggregate",wp);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(website);
 expect(website.stages).toEqual({assigned:1,taught:1,completed:0});
 for(const [studentId,stage] of [[ctx.studentIds[0],"taught"],[ctx.studentIds[1],"assigned"]]){
   const filters={studentId,workplaceId:ctx.workplaceId,
     from:"2041-03-01",to:"2041-03-01"};
   const childSite=await webMaterials(page,{...filters,aggregate:"true"});
   const childMcp=await call("ccp_v1_materials_aggregate",filters);
   expect(childMcp.error).toBeUndefined();
   expect(childMcp.data).toEqual(childSite);
   expect(childSite.evidenceClaims).toBe(1);
   expect(childSite.stages[stage]).toBe(1);
 }
});
