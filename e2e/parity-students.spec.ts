import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

const unique=(name:string)=>name+" "+randomUUID().slice(0,9);
async function mcpStudent(callTool:(name:string,args:Record<string,unknown>)=>Promise<{
  data?:unknown;error?:{code:string;message:string};
}>, name:string){
 const made=await callTool("ccp_v1_students_create",{
   name,idempotencyKey:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 const id=(made.data as {entityId:string}).entityId;
 expect(id).toMatch(/^[0-9a-f-]{36}$/);
 return id;
}
async function browserProfile(page:import("@playwright/test").Page,id:string){
 const res=await page.request.get("/api/students/"+id);
 expect(res.status(),await res.text()).toBe(200);
 return (await res.json()) as Record<string,any>;
}
async function updateProfile(callTool:(name:string,args:Record<string,unknown>)=>Promise<{
 data?:unknown;error?:{code:string;message:string};
}>,page:import("@playwright/test").Page,id:string,changes:Record<string,unknown>){
 const before=await browserProfile(page,id);
 const updated=await callTool("ccp_v1_students_profile_edit",{
   studentId:id,changes,expectedUpdatedAt:before.updated_at,confirmed:true,
 });
 expect(updated.error).toBeUndefined();
 return await browserProfile(page,id);
}

test("PARITY:PARITY-students-roster pages complete and archived rosters consistently",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const website=await page.request.get("/api/students?limit=2&offset=0&activeOnly=true");
 expect(website.status()).toBe(200);
 const roster=await website.json() as {students:Record<string,unknown>[];nextOffset:number|null};
 const tool=(await callTool("ccp_v1_students_roster",{
   limit:2,offset:0,includeArchived:false,
 })).data as {students:Record<string,unknown>[];nextOffset:number|null};
 expect(roster.nextOffset).toBe(tool.nextOffset);
 expect(roster.students.map(x=>x.id)).toEqual(tool.students.map(x=>x.id));
 expect(roster.students.length).toBe(2);
 const second=await page.request.get("/api/students?limit=2&offset=2&activeOnly=true");
 expect(second.status()).toBe(200);
 const other=(await callTool("ccp_v1_students_roster",{
   limit:2,offset:2,includeArchived:false,
 })).data as {students:Array<{id:string}>};
 expect((await second.json()).students.map((x:{id:string})=>x.id))
   .toEqual(other.students.map(x=>x.id));
 const historic=await mcpStudent(callTool,unique("Historical learner"));
 await updateProfile(callTool,page,historic,{archived:true});
 const activeOnly=await page.request.get("/api/students?limit=50&query="+
   encodeURIComponent("Historical learner"));
 expect(activeOnly.status()).toBe(200);
 expect((await activeOnly.json()).students.some((x:{id:string})=>x.id===historic)).toBe(false);
 const mcpDefault=await callTool("ccp_v1_students_roster",{
   query:"Historical learner",limit:50,
 });
 expect(mcpDefault.error).toBeUndefined();
 expect(((mcpDefault.data as {students:Array<{id:string}>}).students)
   .some(x=>x.id===historic)).toBe(false);
 const siteHistoric=await page.request.get("/api/students?limit=50&includeArchived=true&query="+
   encodeURIComponent("Historical learner"));
 expect(siteHistoric.status()).toBe(200);
 expect((await siteHistoric.json()).students.some((x:{id:string})=>x.id===historic)).toBe(true);
 const mcpHistoric=await callTool("ccp_v1_students_roster",{
   query:"Historical learner",includeArchived:true,limit:50,
 });
 expect(((mcpHistoric.data as {students:Array<{id:string}>}).students)
   .some(x=>x.id===historic)).toBe(true);
 const onlyWebsite=await page.request.get("/api/students?limit=50&archivedOnly=true&query="+
   encodeURIComponent("Historical learner"));
 expect(onlyWebsite.status(),await onlyWebsite.text()).toBe(200);
 const onlyModel=await callTool("ccp_v1_students_roster",{
   query:"Historical learner",archivedOnly:true,limit:50,
 });
 expect(onlyModel.error).toBeUndefined();
 expect((await onlyWebsite.json()).students.map((x:{id:string})=>x.id))
   .toEqual((onlyModel.data as {students:Array<{id:string}>}).students.map(x=>x.id));
 expect((await onlyWebsite.json()).students.some((x:{id:string})=>x.id===historic)).toBe(true);
});

test("PARITY:PARITY-students-search matches Hebrew names and aliases and requires disambiguation",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const name=unique("אלוף שחמט");
 const alias=unique("Hebrew learner nickname");
 const id=await mcpStudent(callTool,name);
 await updateProfile(callTool,page,id,{nameAliases:[alias]});
 const website=await page.request.get("/api/students?limit=50&query="+encodeURIComponent(alias));
 expect(website.status()).toBe(200);
 expect((await website.json()).students.some((x:{id:string})=>x.id===id)).toBe(true);
 const tool=await callTool("ccp_v1_students_search",{query:alias});
 expect(((tool.data as Array<{id:string}>)).some(x=>x.id===id)).toBe(true);
 const byHebrew=await callTool("ccp_v1_students_search",{query:name});
 expect(((byHebrew.data as Array<{id:string}>)).some(x=>x.id===id)).toBe(true);
 const sameAlias=await mcpStudent(callTool,unique("Other Hebrew learner"));
 await updateProfile(callTool,page,sameAlias,{nameAliases:[alias]});
 const ambiguous=await callTool("ccp_v1_students_search",{query:alias});
 expect(ambiguous.error?.code).toBe("NEEDS_RESOLUTION");
});

test("PARITY:PARITY-students-create retains canonical Hebrew names across MCP and website",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const hebrew=unique("שחמטאי מתחיל");
 const id=await mcpStudent(callTool,hebrew);
 expect((await browserProfile(page,id)).name).toBe(hebrew);
 const websiteName=unique("מדריך צעיר");
 const created=await page.request.post("/api/students",{data:{name:websiteName}});
 expect(created.status(),await created.text()).toBe(201);
 const webId=(await created.json()).id as string;
 expect((await callTool("ccp_v1_students_profile",{
   studentId:webId,
 })).data).toMatchObject({id:webId,name:websiteName});
 const search=await page.request.get("/api/students?query="+encodeURIComponent(hebrew));
 expect(search.status()).toBe(200);
 expect((await search.json()).students.some((x:{id:string})=>x.id===id)).toBe(true);
});

test("PARITY:PARITY-students-profile-fields correctly updates name level and private chess details",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const id=await mcpStudent(callTool,unique("Full profile"));
 const alias=unique("שם קצר"),rename=unique("Renamed student");
 const after=await updateProfile(callTool,page,id,{
   name:rename,level:"Student-selected anchor",nameAliases:[alias],
   strength:8,birthdate:"2012-03-12",practiceStartDate:"2024-03-01",
   lichessUsername:"study_chess",chesscomUsername:"practiceChess",
   lichessRating:1700,chesscomRating:1820,
   teacherNotes:"Synthetic confidential instruction notes",
   defaultRateCents:4500,travelFeeCents:700,
 });
 expect(after).toMatchObject({
   name:rename,level:"Student-selected anchor",name_aliases:[alias],
   strength:8,birthdate:"2012-03-12",practice_start_date:"2024-03-01",
   lichess_username:"study_chess",chesscom_username:"practiceChess",
   lichess_rating:1700,chesscom_rating:1820,
   teacher_notes:"Synthetic confidential instruction notes",
   default_rate_cents:4500,travel_fee_cents:700,
 });
 const redacted=(await callTool("ccp_v1_students_profile",{studentId:id})).data as Record<string,unknown>;
 expect(redacted.teacher_notes).toBeUndefined();
 expect(redacted.default_rate_cents).toBeUndefined();
 expect(redacted.name).toBe(rename);
 const confirmed=(await callTool("ccp_v1_students_profile",{
   studentId:id,includePrivate:true,confirmed:true,
 })).data as Record<string,unknown>;
 expect(confirmed.teacher_notes).toBe(after.teacher_notes);
 expect(confirmed.default_rate_cents).toBe(after.default_rate_cents);
 const siteEdit=await page.request.put("/api/students/"+id,{data:{
   nameAliases:[],lichessRating:null,chesscomRating:null,
 }});
 expect(siteEdit.status()).toBe(200);
 const revised=(await callTool("ccp_v1_students_profile",{studentId:id})).data as
  {name_aliases:string[];lichess_rating:number|null;chesscom_rating:number|null};
 expect(revised.name_aliases).toEqual([]);
 expect(revised.lichess_rating).toBeNull();
 expect(revised.chesscom_rating).toBeNull();
});

test("PARITY:PARITY-students-archive shares blocker preflight and preserves archived profile",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const id=await mcpStudent(callTool,unique("Archive parity"));
 const preview=(await callTool("ccp_v1_students_archive_preview",{
   studentId:id,
 })).data as {studentId:string;canArchive:boolean;updatedAt:string};
 const website=await page.request.get("/api/students/"+id+"?archivePreview=true");
 expect(website.status()).toBe(200);
 expect(await website.json()).toEqual(preview);
 expect(preview.canArchive).toBe(true);
 const archived=await callTool("ccp_v1_students_profile_edit",{
   studentId:id,changes:{archived:true},expectedUpdatedAt:preview.updatedAt,
   confirmed:true,
 });
 expect(archived.error).toBeUndefined();
 expect((await browserProfile(page,id)).archived_at).toBeTruthy();
 const restored=await page.request.put("/api/students/"+id,{data:{archived:false}});
 expect(restored.status()).toBe(200);
 expect((await callTool("ccp_v1_students_profile",{studentId:id})).data)
   .toMatchObject({id,archived_at:null});
});

test("PARITY:PARITY-students-delete requires impact preview and revision on both surfaces",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const id=await mcpStudent(callTool,unique("Empty removal"));
 const impact=(await callTool("ccp_v1_students_delete_impact",{
   studentId:id,
 })).data as {canDelete:boolean;updatedAt:string};
 expect(impact.canDelete).toBe(true);
 const sitePreview=await page.request.get("/api/students/"+id+"?deletePreview=true");
 expect(sitePreview.status()).toBe(200);
 expect(await sitePreview.json()).toEqual(impact);
 const refused=await page.request.delete("/api/students/"+id);
 expect(refused.status()).toBe(400);
 const removed=await callTool("ccp_v1_students_delete",{
   studentId:id,expectedUpdatedAt:impact.updatedAt,confirmed:true,
 });
 expect(removed.error).toBeUndefined();
 expect((removed.data as {deleted:boolean}).deleted).toBe(true);
 const siteAfter=await page.request.get("/api/students/"+id);
 expect(siteAfter.status()).toBe(404);
});

test("PARITY:PARITY-students-skills preserves 1–5 append-only assessment history",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const id=await mcpStudent(callTool,unique("Skill history"));
 const madeDimension=await callTool("ccp_v1_skill_dimensions_create",{
   name:unique("Synthetic history skill"),confirmed:true,
 });
 expect(madeDimension.error).toBeUndefined();
 const dimensions=[madeDimension.data as {id:string}];
 expect(dimensions[0].id).toMatch(/^[0-9a-f-]{36}$/);
 const first=await callTool("ccp_v1_student_skill_assessments_record",{
   studentId:id,ratings:[{dimensionId:dimensions[0].id,rating:3,note:"First review"}],
   confirmed:true,
 });
 expect(first.error).toBeUndefined();
 const browser=await page.request.get("/api/students/"+id+"/skills");
 expect(browser.status()).toBe(200);
 expect((await browser.json())).toEqual((await callTool(
   "ccp_v1_student_skill_assessments_list",{studentId:id})).data);
 const later=await page.request.post("/api/students/"+id+"/skills",{data:{
   ratings:[{dimensionId:dimensions[0].id,rating:4,note:"Second review"}],
 }});
 expect(later.status()).toBe(200);
 const history=(await callTool("ccp_v1_student_skill_assessments_list",{
   studentId:id,
 })).data as Array<{rating:number;note:string;assessed_on:string}>;
 expect(history).toHaveLength(2);
 expect(history.map(x=>x.rating)).toEqual([3,4]);
 for(const row of history) expect(row.assessed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});


test("PARITY:PARITY-students-full-atomic-family-create shares durable website and MCP receipts",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const name=unique("Full family student");
 const contactEmail="parity-"+randomUUID()+"@example.com";
 const key=randomUUID();
 const payload={
   name,level:"Beginner",teacherNotes:"Private first lesson planning",
   birthdate:"2014-03-04",contactName:"Family "+randomUUID(),
   contactEmail,idempotencyKey:key,
 };
 const model=await callTool("ccp_v1_students_create_full",{
   ...payload,confirmed:true,
 });
 expect(model.error).toBeUndefined();
 const id=(model.data as {id:string}).id;
 expect((model.data as Record<string,unknown>).teacher_notes).toBeUndefined();
 expect((model.data as Record<string,unknown>).contactEmail).toBeUndefined();
 const browser=await browserProfile(page,id);
 expect(browser.name).toBe(name);
 expect(browser.teacher_notes).toBe(payload.teacherNotes);
 expect(browser.guardian_id).toBeTruthy();
 const replay=await page.request.post("/api/students",{data:payload});
 expect(replay.status(),await replay.text()).toBe(201);
 expect((await replay.json()).id).toBe(id);
 const family=await page.request.get("/api/guardians/"+browser.guardian_id);
 expect(family.status(),await family.text()).toBe(200);
 expect((await family.json()).students.filter((s:{id:string})=>s.id===id)).toHaveLength(1);

 const changed=await page.request.post("/api/students",{data:{
   ...payload,name:name+" conflicting",
 }});
 expect(changed.status(),await changed.text()).toBe(409);

 const websiteKey=randomUUID();
 const another={
   name:unique("Browser family student"),contactEmail:"other-"+randomUUID()+"@example.com",
   contactName:"Another guardian",adultSelf:false,idempotencyKey:websiteKey,
 };
 const websiteCreate=await page.request.post("/api/students",{data:another});
 expect(websiteCreate.status(),await websiteCreate.text()).toBe(201);
 const siteStudent=await websiteCreate.json();
 expect(siteStudent.createdFamily).toBe(true);
 const mcpReplay=await callTool("ccp_v1_students_create_full",{
   ...another,confirmed:true,
 });
 expect(mcpReplay.error).toBeUndefined();
 expect((mcpReplay.data as {id:string}).id).toBe(siteStudent.id);
 const originalFamily=await page.request.get("/api/guardians/"+siteStudent.guardian_id);
 expect(originalFamily.status()).toBe(200);
 expect((await originalFamily.json()).students).toHaveLength(1);

 const foreignGuardian=await callTool("ccp_v1_students_create_full",{
   name:unique("Foreign family denied"),guardianId:randomUUID(),
   idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(foreignGuardian.error?.code).toBe("NOT_FOUND");
});

/** Route-family audit companion: students/[id] also exposes historical chess
 * changes and an idempotent revision-based basic update through delegated MCP.
 * These tests exercise both paths instead of merely mentioning tool names. */
test("PARITY:PARITY-students-route-chess-history-current-schema matches browser and MCP historical entries",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const id=await mcpStudent(callTool,unique("Student route chess history"));
 const changed=await page.request.put("/api/students/"+id,{data:{
   strength:5,chessGoals:"Review elementary mating nets",
 }});
 expect(changed.status(),await changed.text()).toBe(200);
 const website=await page.request.get("/api/students/"+id+"?chessHistory=true");
 expect(website.status(),await website.text()).toBe(200);
 const browserHistory=await website.json();
 expect(browserHistory.entries.some((e:{field_name:string;next_value:unknown})=>
   e.field_name==="strength"&&e.next_value===5)).toBe(true);
 const model=await callTool("ccp_v1_students_chess_history",{studentId:id});
 expect(model.error).toBeUndefined();
 expect(model.data).toEqual(browserHistory);
 const before=await browserProfile(page,id);
 const revised=await callTool("ccp_v1_students_profile_edit",{
   studentId:id,expectedUpdatedAt:before.updated_at,
   changes:{strength:8},confirmed:true,
 });
 expect(revised.error).toBeUndefined();
 const historyAgain=await page.request.get("/api/students/"+id+"?chessHistory=true");
 expect(historyAgain.status(),await historyAgain.text()).toBe(200);
 expect((await callTool("ccp_v1_students_chess_history",{studentId:id})).data)
   .toEqual(await historyAgain.json());
});

test("PARITY:PARITY-students-route-basic-revision-update shares website and MCP receipt",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const id=await mcpStudent(callTool,unique("Student route basic update"));
 const before=await browserProfile(page,id);
 const idempotencyKey=randomUUID();
 const args={
   studentId:id,level:"Synthetic chess endgame course",
   expectedUpdatedAt:before.updated_at,idempotencyKey,
 };
 const model=await callTool("ccp_v1_students_update",args);
 expect(model.error).toBeUndefined();
 expect(model.data).toMatchObject({operation:"students.update",entityId:id,idempotencyKey});
 const website=await page.request.post("/api/agent/v1",{data:{
   action:"students.update",...args,
 }});
 expect(website.status(),await website.text()).toBe(200);
 expect((await website.json()).data).toEqual(model.data);
 expect((await browserProfile(page,id)).level).toBe(args.level);
 const conflicting=await callTool("ccp_v1_students_update",{
   ...args,level:"Should not overwrite existing receipt",
 });
 expect(conflicting.error?.code).toBe("CONFLICT");
 expect((await browserProfile(page,id)).level).toBe(args.level);
});
