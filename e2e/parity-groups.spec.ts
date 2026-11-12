import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

const label=(prefix:string)=>prefix+" "+randomUUID().slice(0,9);
async function workplace(callTool:(n:string,a:Record<string,unknown>)=>Promise<any>){
 const data=(await callTool("ccp_v1_workplaces_list",{})).data as Array<{id:string}>;
 expect(data.length).toBeGreaterThan(0);
 return data[0].id;
}
async function createGroup(callTool:(n:string,a:Record<string,unknown>)=>Promise<any>,
  workplaceId:string){
 const r=await callTool("ccp_v1_groups_create",{
   workplaceId,name:label("Class"),idempotencyKey:randomUUID(),
 });
 expect(r.error).toBeUndefined();
 return r.data as {entityId:string;revision:string};
}
async function createStudent(callTool:(n:string,a:Record<string,unknown>)=>Promise<any>){
 const r=await callTool("ccp_v1_students_create",{
   name:label("Class member"),idempotencyKey:randomUUID(),
 });
 expect(r.error).toBeUndefined();
 return (r.data as {entityId:string}).entityId;
}

test("PARITY:PARITY-groups-list compares group and member ownership between transports",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const id=await workplace(callTool);
 await createGroup(callTool,id);
 const web=await page.request.post("/api/agent/v1",{data:{action:"groups.list"}});
 expect(web.status()).toBe(200);
 const groups=(await web.json()).data as Array<{id:string;workplace_id:string}>;
 const tool=(await callTool("ccp_v1_groups_list",{})).data;
 expect(tool).toEqual(groups);
 const owned=groups.find(g=>g.workplace_id===id);
 expect(owned).toBeTruthy();
 const webMembers=await page.request.post("/api/agent/v1",{data:{
   action:"groups.members",groupId:owned!.id,
 }});
 expect(webMembers.status()).toBe(200);
 expect((await webMembers.json()).data).toEqual((await callTool(
   "ccp_v1_groups_members",{groupId:owned!.id})).data);
});

test("PARITY:PARITY-groups-create-update keeps class rename and revision identical",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const wp=await workplace(callTool);
 const created=await createGroup(callTool,wp);
 const renamed=await callTool("ccp_v1_groups_update",{
   groupId:created.entityId,workplaceId:wp,name:label("Corrected class"),
   expectedUpdatedAt:created.revision,idempotencyKey:randomUUID(),
 });
 expect(renamed.error).toBeUndefined();
 const browserList=await page.request.post("/api/agent/v1",{data:{action:"groups.list"}});
 expect(browserList.status()).toBe(200);
 expect((await browserList.json()).data.some(
   (g:{id:string})=>g.id===created.entityId)).toBe(true);
 const siteEdit=await page.request.post("/api/agent/v1",{data:{
   action:"groups.update",groupId:created.entityId,workplaceId:wp,
   name:label("Browser class name"),
   expectedUpdatedAt:renamed.data.revision,idempotencyKey:randomUUID(),
 }});
 expect(siteEdit.status()).toBe(200);
 // An atomic rename returns a revision receipt, not a materialized group.
 // Compare the persisted group through the website list and delegated MCP.
 const receipt=(await siteEdit.json()).data as {entityId:string;revision:string};
 expect(receipt.entityId).toBe(created.entityId);
 expect(receipt.revision).toBeTruthy();
 const browserRead=await page.request.post("/api/agent/v1",{
   data:{action:"groups.list"},
 });
 expect(browserRead.status(),await browserRead.text()).toBe(200);
 const fromBrowser=((await browserRead.json()).data as Array<{id:string;name:string}>)
   .find(g=>g.id===created.entityId);
 expect(fromBrowser).toBeTruthy();
 const after=(await callTool("ccp_v1_groups_list",{})).data as Array<{id:string;name:string}>;
 expect(fromBrowser?.name).toBe(after.find(g=>g.id===created.entityId)?.name);
 expect(fromBrowser?.name).toMatch(/^Browser class name/);
 const stale=await callTool("ccp_v1_groups_update",{
   groupId:created.entityId,workplaceId:wp,name:"Wrong stale edit",
   expectedUpdatedAt:created.revision,idempotencyKey:randomUUID(),
 });
 expect(stale.error?.code).toBe("CONFLICT");
});

test("PARITY:PARITY-groups-memberships preserves frozen session roster after removal",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const wp=await workplace(callTool),group=await createGroup(callTool,wp);
 const a=await createStudent(callTool),b=await createStudent(callTool);
 for(const studentId of [a,b]){
   const enrolled=await callTool("ccp_v1_groups_enroll",{
     groupId:group.entityId,studentId,idempotencyKey:randomUUID(),
   });
   expect(enrolled.error).toBeUndefined();
 }
 const website=await page.request.post("/api/agent/v1",{data:{
   action:"groups.members",groupId:group.entityId,
 }});
 expect(website.status()).toBe(200);
 expect((await website.json()).data).toEqual((await callTool(
   "ccp_v1_groups_members",{groupId:group.entityId})).data);
 const startsAt=new Date(Date.now()+800000000000+Math.floor(Math.random()*200000000)).toISOString();
 const created=await callTool("ccp_v1_sessions_create",{
   workplaceId:wp,groupId:group.entityId,
   title:label("Frozen roster lesson"),startsAt,durationMinutes:45,
   lessonNote:"Synthetic lesson",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=(created.data as {entityId:string}).entityId;
 const snapshot=await callTool("ccp_v1_sessions_details",{sessionId});
 expect(((snapshot.data as {participants:Array<{student_id:string}>}).participants)
   .map(x=>x.student_id).sort()).toEqual([a,b].sort());
 const removed=await page.request.post("/api/agent/v1",{data:{
   action:"groups.unenroll",groupId:group.entityId,studentId:a,
 }});
 expect(removed.status()).toBe(200);
 const current=(await callTool("ccp_v1_groups_members",{
   groupId:group.entityId,
 })).data as Array<{student_id:string}>;
 expect(current.map(x=>x.student_id)).toEqual([b]);
 const frozenAfter=await page.request.post("/api/agent/v1",{data:{
   action:"sessions.participants",sessionId,
 }});
 expect(frozenAfter.status()).toBe(200);
 expect((await frozenAfter.json()).data.map((x:{student_id:string})=>x.student_id).sort())
   .toEqual([a,b].sort());
 expect((await callTool("ccp_v1_sessions_details",{sessionId})).data)
   .toMatchObject({id:sessionId});
 const removedSecond=await callTool("ccp_v1_groups_unenroll",{
   groupId:group.entityId,studentId:b,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(removedSecond.error).toBeUndefined();
 expect((await callTool("ccp_v1_sessions_participants",{
   sessionId,
 })).data).toEqual(await frozenAfter.json().then(x=>x.data));
});

test("PARITY:PARITY-groups-archived-roster retains frozen lesson history after archiving a former member",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const wp=await workplace(callTool),group=await createGroup(callTool,wp);
 const first=await createStudent(callTool),second=await createStudent(callTool);
 for(const studentId of [first,second]){
   const joined=await callTool("ccp_v1_groups_enroll",{
     groupId:group.entityId,studentId,idempotencyKey:randomUUID(),
   });
   expect(joined.error).toBeUndefined();
 }
 // A completed historical lesson must not gain or lose students when the
 // live roster changes, or when a student is archived after teaching ends.
 const created=await callTool("ccp_v1_sessions_create",{
   workplaceId:wp,groupId:group.entityId,
   title:label("Historical chess class"),
   startsAt:"2026-06-01T12:00:00.000Z",durationMinutes:60,
   lessonNote:"Preserved historical roster",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=created.data.entityId as string;
 const websiteBefore=await page.request.post("/api/agent/v1",{data:{
   action:"sessions.participants",sessionId,
 }});
 expect(websiteBefore.status(),await websiteBefore.text()).toBe(200);
 const frozen=(await websiteBefore.json()).data as Array<{student_id:string}>;
 expect(frozen.map(x=>x.student_id).sort()).toEqual([first,second].sort());
 const removed=await callTool("ccp_v1_groups_unenroll",{
   groupId:group.entityId,studentId:first,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(removed.error).toBeUndefined();
 const preview=await callTool("ccp_v1_students_archive_preview",{studentId:first});
 expect(preview.error).toBeUndefined();
 const sitePreview=await page.request.get(
   "/api/students/"+first+"?archivePreview=true");
 expect(sitePreview.status(),await sitePreview.text()).toBe(200);
 expect(await sitePreview.json()).toEqual(preview.data);
 expect(preview.data.canArchive).toBe(true);
 const archived=await page.request.put("/api/students/"+first,{
   data:{archived:true},
 });
 expect(archived.status(),await archived.text()).toBe(200);
 const mcpStudent=await callTool("ccp_v1_students_profile",{studentId:first});
 expect(mcpStudent.error).toBeUndefined();
 expect(mcpStudent.data.archived_at).toBeTruthy();
 const websiteAfter=await page.request.post("/api/agent/v1",{data:{
   action:"sessions.participants",sessionId,
 }});
 expect(websiteAfter.status(),await websiteAfter.text()).toBe(200);
 const saved=(await websiteAfter.json()).data;
 expect(saved).toEqual(frozen);
 const mcpAfter=await callTool("ccp_v1_sessions_participants",{sessionId});
 expect(mcpAfter.error).toBeUndefined();
 expect(mcpAfter.data).toEqual(saved);
 const current=await callTool("ccp_v1_groups_members",{groupId:group.entityId});
 expect(current.error).toBeUndefined();
 expect((current.data as Array<{student_id:string}>).map(x=>x.student_id))
   .toEqual([second]);
 const historical=await callTool("ccp_v1_sessions_details",{sessionId});
 expect(historical.error).toBeUndefined();
 expect((historical.data.participants as Array<{student_id:string}>)
   .map(x=>x.student_id).sort()).toEqual([first,second].sort());
});
