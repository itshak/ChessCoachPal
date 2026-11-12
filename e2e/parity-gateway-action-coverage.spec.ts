import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";

type Tool=(name:string,args:Record<string,unknown>)=>Promise<any>;
const unique=(prefix:string)=>prefix+" "+randomUUID().slice(0,8);
async function teacherContext(call:Tool){
 const workplace=await call("ccp_v1_workplaces_create",{
  name:unique("Gateway audit workplace"),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const students:string[]=[];
 for(let i=0;i<2;i++){
  const made=await call("ccp_v1_students_create",{
   name:unique("Gateway audit learner"),idempotencyKey:randomUUID(),
  });
  expect(made.error).toBeUndefined();
  students.push(made.data.entityId as string);
 }
 return {workplaceId,students};
}

test("PARITY:PARITY-gateway-student-search-and-workplace-unenroll uses both real action transports",async({page,request})=>{
 const call=await delegatedTool(page,request),ctx=await teacherContext(call);
 const [a,b]=ctx.students;
 const searchWeb=await page.request.post("/api/agent/v1",{
  data:{action:"students.search",query:"Gateway audit learner"},
 });
 expect(searchWeb.status(),await searchWeb.text()).toBe(200);
 const webStudents=(await searchWeb.json()).data;
 const searchMcp=await call("ccp_v1_students_search",{query:"Gateway audit learner"});
 expect(searchMcp.error).toBeUndefined();
 // MCP intentionally returns additional owner-scoped chess profile metadata.
 // Parity requires identical searchable identities, names, levels and
 // revisions, not stripping those richer MCP capabilities.
 const common=(rows:Array<{id:string;name:string;level:string|null;
  updated_at:string}>)=>rows.map(({id,name,level,updated_at})=>({
   id,name,level,updated_at,
 })).sort((x,y)=>x.id.localeCompare(y.id));
 expect(common(searchMcp.data)).toEqual(common(webStudents));
 expect(webStudents.some((x:{id:string})=>x.id===a)).toBe(true);
 expect(searchMcp.data.find((x:{id:string})=>x.id===a))
  .toHaveProperty("name_aliases");

 for(const studentId of [a,b]){
  const joined=await call("ccp_v1_workplaces_enroll",{
   workplaceId:ctx.workplaceId,studentId,idempotencyKey:randomUUID(),
  });
  expect(joined.error).toBeUndefined();
 }
 const removedWeb=await page.request.post("/api/agent/v1",{
  data:{action:"workplaces.unenroll",workplaceId:ctx.workplaceId,
   studentId:a,confirmed:true},
 });
 expect(removedWeb.status(),await removedWeb.text()).toBe(200);
 const deletedWeb=(await removedWeb.json()).data;
 expect(deletedWeb.removed).toBe(true);
 const afterWeb=await call("ccp_v1_workplaces_enrollments",{
  workplaceId:ctx.workplaceId,
 });
 expect(afterWeb.error).toBeUndefined();
 expect(afterWeb.data.some((x:{student_id:string})=>x.student_id===a)).toBe(false);
 const removedMcp=await call("ccp_v1_workplaces_unenroll",{
  workplaceId:ctx.workplaceId,studentId:b,confirmed:true,
 });
 expect(removedMcp.error).toBeUndefined();
 expect(removedMcp.data).toEqual(deletedWeb);
 const webRead=await page.request.post("/api/agent/v1",{
  data:{action:"workplaces.enrollments",workplaceId:ctx.workplaceId},
 });
 expect(webRead.status(),await webRead.text()).toBe(200);
 expect((await webRead.json()).data).toEqual([]);
});

test("PARITY:PARITY-gateway-group-create-enroll has reverse-direction membership readback",async({page,request})=>{
 const call=await delegatedTool(page,request),ctx=await teacherContext(call);
 for(const studentId of ctx.students){
  expect((await call("ccp_v1_workplaces_enroll",{
   workplaceId:ctx.workplaceId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 }
 const created=await page.request.post("/api/agent/v1",{
  data:{action:"groups.create",workplaceId:ctx.workplaceId,name:unique("Gateway class")},
 });
 expect(created.status(),await created.text()).toBe(201);
 const groupId=(await created.json()).data.id as string;
 expect(groupId).toMatch(/^[0-9a-f-]{36}$/);
 const modelGroups=await call("ccp_v1_groups_list",{});
 expect(modelGroups.error).toBeUndefined();
 expect(modelGroups.data.some((x:{id:string})=>x.id===groupId)).toBe(true);
 const mcpGroup=await call("ccp_v1_groups_create",{
  workplaceId:ctx.workplaceId,name:unique("MCP class"),idempotencyKey:randomUUID(),
 });
 expect(mcpGroup.error).toBeUndefined();
 const siteGroups=await page.request.post("/api/agent/v1",{data:{action:"groups.list"}});
 expect(siteGroups.status(),await siteGroups.text()).toBe(200);
 expect((await siteGroups.json()).data.some((x:{id:string})=>x.id===mcpGroup.data.entityId)).toBe(true);

 const siteEnroll=await page.request.post("/api/agent/v1",{data:{
  action:"groups.enroll",groupId,studentId:ctx.students[0],
 }});
 expect(siteEnroll.status(),await siteEnroll.text()).toBe(200);
 const modelMembers=await call("ccp_v1_groups_members",{groupId});
 expect(modelMembers.error).toBeUndefined();
 expect(modelMembers.data.some((x:{student_id:string})=>x.student_id===ctx.students[0])).toBe(true);
 const modelEnroll=await call("ccp_v1_groups_enroll",{
  groupId,studentId:ctx.students[1],idempotencyKey:randomUUID(),
 });
 expect(modelEnroll.error).toBeUndefined();
 const siteMembers=await page.request.post("/api/agent/v1",{
  data:{action:"groups.members",groupId},
 });
 expect(siteMembers.status(),await siteMembers.text()).toBe(200);
 expect((await siteMembers.json()).data).toEqual((await call("ccp_v1_groups_members",{groupId})).data);
 expect((await siteMembers.json()).data).toHaveLength(2);
});

test("PARITY:PARITY-gateway-sessions-list matches one current frozen session on website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request),ctx=await teacherContext(call);
 const studentId=ctx.students[0];
 const joined=await call("ccp_v1_workplaces_enroll",{
  workplaceId:ctx.workplaceId,studentId,idempotencyKey:randomUUID(),
 });
 expect(joined.error).toBeUndefined();
 // Every retry must create its own teacher time interval, otherwise a
 // correct overlap guard turns a previous test attempt into a false failure.
 const minute=parseInt(randomUUID().slice(0,8),16)%(365*8*24*60);
 const startsAt=new Date(Date.UTC(2058,0,1)+minute*60_000).toISOString();
 const session=await page.request.post("/api/agent/v1",{data:{
  action:"sessions.create",workplaceId:ctx.workplaceId,studentId,
  title:unique("Website lesson"),startsAt,
  durationMinutes:45,lessonNote:"One current session",requestId:randomUUID(),
 }});
 expect(session.status(),await session.text()).toBe(201);
 const id=(await session.json()).data.id as string;
 const siteList=await page.request.post("/api/agent/v1",{data:{action:"sessions.list"}});
 expect(siteList.status(),await siteList.text()).toBe(200);
 const rows=(await siteList.json()).data as Array<{id:string;title:string;student_id:string}>;
 expect(rows.find(x=>x.id===id)?.student_id).toBe(studentId);
 const mcpList=await call("ccp_v1_sessions_list",{});
 expect(mcpList.error).toBeUndefined();
 // Delegated MCP additionally returns the revision required for safe edits.
 // The historical website gateway projection omits that one capability.
 const comparable=(mcpList.data as Array<Record<string,unknown>>)
  .map(({revision,...rest})=>rest);
 expect(comparable).toEqual(rows);
 expect((mcpList.data as Array<{id:string;revision:string}>)
  .find(x=>x.id===id)?.revision).toBeTruthy();
});

test("PARITY:PARITY-gateway-observation-edit preserves unverified provenance in both clients",async({page,request})=>{
 const call=await delegatedTool(page,request),ctx=await teacherContext(call);
 const categories=await call("ccp_v1_chess_categories_list",{});
 expect(categories.error).toBeUndefined();
 expect(categories.data.length).toBeGreaterThan(0);
 const studentId=ctx.students[0];
 const proposed=await call("ccp_v1_chess_observations_propose",{
  studentId,categoryId:categories.data[0].id,
  observation:unique("Unverified candidate"),requestId:randomUUID(),
 });
 expect(proposed.error).toBeUndefined();
 const observationId=proposed.data.id as string;
 const websiteEdit=await page.request.post("/api/agent/v1",{
  data:{action:"chess.observations.update",observationId,
   observation:unique("Browser correction")},
 });
 expect(websiteEdit.status(),await websiteEdit.text()).toBe(200);
 const mcpRead=await call("ccp_v1_chess_observations_list",{studentId});
 expect(mcpRead.error).toBeUndefined();
 const browserRecord=mcpRead.data.find((x:{id:string})=>x.id===observationId);
 expect(browserRecord).toBeDefined();
 expect(browserRecord.verified_at).toBeNull();
 const updated=await call("ccp_v1_chess_observations_update",{
  observationId,observation:unique("MCP corrected candidate"),confirmed:true,
 });
 expect(updated.error).toBeUndefined();
 const websiteRead=await page.request.post("/api/agent/v1",{
  data:{action:"chess.observations.list",studentId},
 });
 expect(websiteRead.status(),await websiteRead.text()).toBe(200);
 expect((await websiteRead.json()).data).toEqual(
  (await call("ccp_v1_chess_observations_list",{studentId})).data);
 expect((await websiteRead.json()).data.find((x:{id:string})=>x.id===observationId)
  .verified_at).toBeNull();
});

test("PARITY:PARITY-gateway-material-unlink-impact-and-delete preserves catalog across browser and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request),ctx=await teacherContext(call);
 const studentId=ctx.students[0];
 const newMaterial=await call("ccp_v1_learning_materials_create",{
  kind:"study_chapter",title:unique("Linked chess study"),description:"",
  sourceUrl:"https://lichess.org/study/AbCd1234",
  details:{provider:"lichess",studyId:"AbCd1234",chapterId:null},
  requestId:randomUUID(),
 });
 expect(newMaterial.error).toBeUndefined();
 const materialId=newMaterial.data.material.id as string;
 const link=await call("ccp_v1_material_links_create",{
  studentId,materialId,requestId:randomUUID(),confirmed:true,
 });
 expect(link.error).toBeUndefined();
 const linkId=link.data.link.id as string;
 const previewSite=await page.request.post("/api/agent/v1",{
  data:{action:"materials.links.unlinkImpact",linkId},
 });
 expect(previewSite.status(),await previewSite.text()).toBe(200);
 const previewMcp=await call("ccp_v1_material_links_unlink_impact",{linkId});
 expect(previewMcp.error).toBeUndefined();
 expect(previewMcp.data).toEqual((await previewSite.json()).data);
 expect(previewMcp.data.canUnlink).toBe(true);
 const wrongRevision=await page.request.post("/api/agent/v1",{
  data:{action:"materials.links.unlink",linkId,expectedRevision:9999,confirmed:true},
 });
 expect(wrongRevision.status(),await wrongRevision.text()).toBe(409);
 const browserUnlink=await page.request.post("/api/agent/v1",{data:{
  action:"materials.links.unlink",linkId,expectedRevision:link.data.link.revision,
  confirmed:true,
 }});
 expect(browserUnlink.status(),await browserUnlink.text()).toBe(200);
 expect((await browserUnlink.json()).data.unlinked).toBe(true);
 const modelRead=await call("ccp_v1_material_links_list",{studentId});
 expect(modelRead.error).toBeUndefined();
 expect(modelRead.data.links.some((x:{id:string})=>x.id===linkId)).toBe(false);
 const second=await call("ccp_v1_material_links_create",{
  studentId,materialId,requestId:randomUUID(),confirmed:true,
 });
 expect(second.error).toBeUndefined();
 const removedMcp=await call("ccp_v1_material_links_unlink",{
  linkId:second.data.link.id,expectedRevision:second.data.link.revision,
  confirmed:true,
 });
 expect(removedMcp.error).toBeUndefined();
 const siteList=await page.request.post("/api/agent/v1",{
  data:{action:"materials.links.list",studentId},
 });
 expect(siteList.status(),await siteList.text()).toBe(200);
 expect((await siteList.json()).data.links.some((x:{id:string})=>x.id===second.data.link.id))
  .toBe(false);
 const catalog=await call("ccp_v1_learning_materials_get",{materialId});
 expect(catalog.error).toBeUndefined();
 expect(JSON.stringify(catalog.data)).toContain(materialId);
});


test("PARITY:PARITY-gateway-observation-browser-approval-requires-person-rejects-bearer-forgery",async({page,request})=>{
 const call=await delegatedTool(page,request),ctx=await teacherContext(call);
 const categories=await call("ccp_v1_chess_categories_list",{});
 expect(categories.error).toBeUndefined();
 expect(categories.data.length).toBeGreaterThan(0);
 const studentId=ctx.students[0],categoryId=categories.data[0].id as string;
 const observationId=(await call("ccp_v1_chess_observations_propose",{
  studentId,categoryId,observation:unique("Agent-proposed candidate"),
  requestId:randomUUID(),
 })).data.id as string;
 const bearer=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const login=await bearer.auth.signInWithPassword(SEED_TEACHER);
 expect(login.error).toBeNull();
 const headers={Authorization:"Bearer "+login.data.session!.access_token};
 const forgedApprove=await request.post("/api/agent/v1",{
  headers,data:{action:"chess.observations.approve",observationId},
 });
 expect(forgedApprove.status(),await forgedApprove.text()).toBe(403);
 expect((await forgedApprove.json()).error.code).toBe("BROWSER_APPROVAL_REQUIRED");
 const forgedCreate=await request.post("/api/agent/v1",{
  headers,data:{action:"chess.observations.create",studentId,categoryId,
   observation:unique("Forged teacher observation"),requestId:randomUUID()},
 });
 expect(forgedCreate.status(),await forgedCreate.text()).toBe(403);
 expect((await forgedCreate.json()).error.code).toBe("BROWSER_APPROVAL_REQUIRED");
 const preApproval=await call("ccp_v1_chess_observations_list",{studentId});
 expect(preApproval.error).toBeUndefined();
 expect(preApproval.data.find((x:{id:string})=>x.id===observationId).verified_at).toBeNull();
 const approved=await page.request.post("/api/agent/v1",{
  data:{action:"chess.observations.approve",observationId},
 });
 expect(approved.status(),await approved.text()).toBe(200);
 const teacherCreated=await page.request.post("/api/agent/v1",{
  data:{action:"chess.observations.create",studentId,categoryId,
   observation:unique("Teacher-attested through browser"),requestId:randomUUID()},
 });
 expect(teacherCreated.status(),await teacherCreated.text()).toBe(201);
 const mcpRead=await call("ccp_v1_chess_observations_list",{studentId});
 expect(mcpRead.error).toBeUndefined();
 expect(mcpRead.data.find((x:{id:string})=>x.id===observationId).verified_at).toBeTruthy();
 const teacherObservationId=(await teacherCreated.json()).data.id as string;
 expect(mcpRead.data.find((x:{id:string})=>x.id===teacherObservationId).source).toBe("teacher");
});


test("PARITY:PARITY-gateway-discovery-get-is-authenticated-and-MCP-contract-remains-callable",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const discovery=await page.request.get("/api/agent/v1");
 expect(discovery.status(),await discovery.text()).toBe(200);
 const content=await discovery.json();
 expect(content.name).toBe("ChessCoachPal");
 expect(content.status).toBe("experimental");
 expect(content.tools).toContain("students.search");
 expect(content.warning).toContain("delegated OAuth/MCP");
 const model=await call("ccp_v1_students_search",{query:""});
 expect(model.error).toBeUndefined();
 expect(Array.isArray(model.data)).toBe(true);
 const anonymous=await request.get("/api/agent/v1");
 expect(anonymous.status()).toBe(401);
});
