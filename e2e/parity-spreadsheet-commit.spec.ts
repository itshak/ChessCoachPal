import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-spreadsheet-preview-commit-replay shares mapping and deduplicated receipt",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const list=await page.request.post("/api/agent/v1",{data:{action:"workplaces.list"}});
 expect(list.status(),await list.text()).toBe(200);
 const owned=(await list.json()).data as Array<{id:string;name:string}>;
 const workplaceId=owned.find(w=>w.name==="Private coaching")?.id??owned[0]?.id;
 expect(workplaceId).toBeTruthy();
 const name="CSV chess learner "+randomUUID(),parent="Guardian "+randomUUID().slice(0,7);
 const csv="Student Name,Guardian Name\n"+name+","+parent+"\n";
 const filename="parity-pupils.csv";
 const fromMcp=await call("ccp_import_spreadsheet_parse",{
   filename,base64:Buffer.from(csv).toString("base64"),
 });
 expect(fromMcp.error).toBeUndefined();
 expect(fromMcp.data.previewTotal).toBe(1);
 const webParse=await page.request.post("/api/import/spreadsheet/parse",{
   multipart:{file:{name:filename,mimeType:"text/csv",buffer:Buffer.from(csv)}},
 });
 expect(webParse.status(),await webParse.text()).toBe(200);
 const parsed=await webParse.json();
 expect(fromMcp.data.rows).toEqual(parsed.rows);
 expect(fromMcp.data.mapping).toEqual(parsed.mapping);
 const rows=parsed.rows as Record<string,string>[],mapping=parsed.mapping as Record<string,string|null>;
 const webPreview=await page.request.put("/api/import/spreadsheet/parse",{
   data:{rows,mapping},
 });
 expect(webPreview.status(),await webPreview.text()).toBe(200);
 const modelPreview=await call("ccp_import_spreadsheet_preview",{rows,mapping});
 expect(modelPreview.error).toBeUndefined();
 expect(modelPreview.data).toEqual(await webPreview.json());
 const idempotencyKey=randomUUID();
 const write=await call("ccp_import_spreadsheet_commit",{
   rows,mapping,idempotencyKey,workplaceId,confirmed:true,
 });
 expect(write.error).toBeUndefined();
 expect(write.data.studentsCreated).toBe(1);
 expect(write.data.receiptId).toBe(idempotencyKey);
 const webReplay=await page.request.post("/api/import/spreadsheet/commit",{
   data:{rows,mapping,idempotencyKey,workplaceId},
 });
 expect(webReplay.status(),await webReplay.text()).toBe(200);
 expect(await webReplay.json()).toEqual(write.data);
 const roster=await page.request.get("/api/students?query="+encodeURIComponent(name));
 expect(roster.status()).toBe(200);
 expect((await roster.json()).students.filter((s:{name:string})=>s.name===name))
   .toHaveLength(1);
 expect(JSON.stringify(write.data)).not.toContain("portal_token");
});

test("PARITY:PARITY-spreadsheet-archived-status-website-MCP-atomic-roundtrip",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const list=await page.request.post("/api/agent/v1",{data:{action:"workplaces.list"}});
 expect(list.status(),await list.text()).toBe(200);
 const owned=(await list.json()).data as Array<{id:string;name:string}>;
 const workplaceId=owned.find(w=>w.name==="Private coaching")?.id??owned[0]?.id;
 expect(workplaceId).toBeTruthy();
 const historicalName="Archived imported chess learner "+randomUUID();
 const currentName="Active imported chess learner "+randomUUID();
 const csv="Student Name,Archived\n"+historicalName+",inactive\n"+currentName+",active\n";
 const filename="historical-learners.csv";
 const parsedResponse=await page.request.post("/api/import/spreadsheet/parse",{
   multipart:{file:{name:filename,mimeType:"text/csv",buffer:Buffer.from(csv)}},
 });
 expect(parsedResponse.status(),await parsedResponse.text()).toBe(200);
 const parsed=await parsedResponse.json();
 expect(parsed.mapping.archived).toBe("Archived");
 expect(parsed.previewRows.map((r:{archived:boolean})=>r.archived)).toEqual([true,false]);
 const {rows,mapping}=parsed as {rows:Record<string,string>[];mapping:Record<string,string|null>};
 const modelPreview=await call("ccp_import_spreadsheet_preview",{rows,mapping});
 expect(modelPreview.error).toBeUndefined();
 const browserPreview=await page.request.put("/api/import/spreadsheet/parse",{data:{rows,mapping}});
 expect(browserPreview.status(),await browserPreview.text()).toBe(200);
 expect(modelPreview.data).toEqual(await browserPreview.json());
 const key=randomUUID();
 const browserCommit=await page.request.post("/api/import/spreadsheet/commit",{
   data:{rows,mapping,idempotencyKey:key,workplaceId},
 });
 expect(browserCommit.status(),await browserCommit.text()).toBe(200);
 const committed=await browserCommit.json();
 expect(committed.studentsCreated).toBe(2);
 const mcpReplay=await call("ccp_import_spreadsheet_commit",{
   rows,mapping,idempotencyKey:key,workplaceId,confirmed:true,
 });
 expect(mcpReplay.error).toBeUndefined();
 expect(mcpReplay.data).toEqual(committed);
 const archivedWebsite=await page.request.get("/api/students?archivedOnly=true&query="+encodeURIComponent(historicalName));
 expect(archivedWebsite.status()).toBe(200);
 expect((await archivedWebsite.json()).students.some((s:{name:string})=>s.name===historicalName)).toBe(true);
 const archivedMcp=await call("ccp_students_roster",{query:historicalName,archivedOnly:true});
 expect(archivedMcp.error).toBeUndefined();
 expect(((archivedMcp.data as {students:Array<{name:string}>}).students)
   .some(s=>s.name===historicalName)).toBe(true);
 const activeWebsite=await page.request.get("/api/students?query="+encodeURIComponent(currentName));
 expect(activeWebsite.status()).toBe(200);
 expect((await activeWebsite.json()).students.some((s:{name:string})=>s.name===currentName)).toBe(true);
 const excluded=await page.request.get("/api/students?query="+encodeURIComponent(historicalName));
 expect(excluded.status()).toBe(200);
 expect((await excluded.json()).students.some((s:{name:string})=>s.name===historicalName)).toBe(false);
});

test("PARITY:PARITY-spreadsheet-capacity rejects the entire over-cap batch then permits same-key retry",async({page,request})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="capacity-spreadsheet-"+randomUUID()+"@example.com";
 const password="SyntheticSpreadsheetCapacity-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Synthetic spreadsheet capacity",
   onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacherId,1);
  const workplace=await admin.from("workplaces").select("id").eq("teacher_id",teacherId).single();
  expect(workplace.error).toBeNull();
  const workplaceId=workplace.data!.id;
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const names=["Import learner "+randomUUID(),"Other learner "+randomUUID()];
  const rows=names.map(name=>({"Student Name":name,"Guardian Name":"Guardian "+name}));
  const mapping={student_name:"Student Name",guardian_name:"Guardian Name"};
  const idempotencyKey=randomUUID();
  const body={rows,mapping,workplaceId,idempotencyKey};
  const persisted=async(expected:number)=>{
   for(const table of ["students","contacts","workplace_enrollments","teacher_spreadsheet_import_receipts"]){
    const {count,error}=await admin.from(table).select("*",{head:true,count:"exact"}).eq("teacher_id",teacherId);
    expect(error,table).toBeNull();
    expect(count,table).toBe(expected);
   }
   const count=await admin.from("teacher_entitlement_state").select("active_student_count").eq("teacher_id",teacherId).single();
   expect(count.error).toBeNull();
   expect(count.data?.active_student_count).toBe(expected);
  };
  const rejected=await page.request.post("/api/import/spreadsheet/commit",{data:body});
  expect(rejected.status(),await rejected.text()).toBe(409);
  expect((await rejected.json()).code).toBe("CAPACITY_EXCEEDED");
  await persisted(0);
  const mcpRejected=await call("ccp_import_spreadsheet_commit",{...body,confirmed:true});
  expect(mcpRejected.error?.code).toBe("CAPACITY_EXCEEDED");
  await persisted(0);
  const retry={...body,rows:[rows[0]]};
  const accepted=await call("ccp_import_spreadsheet_commit",{...retry,confirmed:true});
  expect(accepted.error).toBeUndefined();
  expect(accepted.data).toMatchObject({
   receiptId:idempotencyKey,studentsCreated:1,contactsCreated:1,enrollmentsCreated:1,
  });
  const replay=await page.request.post("/api/import/spreadsheet/commit",{data:retry});
  expect(replay.status(),await replay.text()).toBe(200);
  expect(await replay.json()).toEqual(accepted.data);
  await persisted(1);
  const readback=await admin.from("students").select("name").eq("teacher_id",teacherId);
  expect(readback.error).toBeNull();
  expect(readback.data).toEqual([{name:names[0]}]);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
