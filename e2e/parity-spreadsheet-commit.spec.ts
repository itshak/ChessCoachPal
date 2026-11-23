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
   data:{rows,mapping,workplaceId},
 });
 expect(webPreview.status(),await webPreview.text()).toBe(200);
 const modelPreview=await call("ccp_import_spreadsheet_preview",{rows,mapping,workplaceId});
 expect(modelPreview.error).toBeUndefined();
 expect(modelPreview.data).toEqual(await webPreview.json());
 const idempotencyKey=randomUUID();
 const write=await call("ccp_import_spreadsheet_commit",{
   rows,mapping,idempotencyKey,workplaceId,reviewDigest:modelPreview.data.reviewDigest,reviewedEnvelope:modelPreview.data.reviewedEnvelope,confirmed:true,
 });
 expect(write.error).toBeUndefined();
 expect(write.data.studentsCreated).toBe(1);
 expect(write.data.receiptId).toBe(idempotencyKey);
 const webReplay=await page.request.post("/api/import/spreadsheet/commit",{
   data:{rows,mapping,idempotencyKey,workplaceId,reviewDigest:modelPreview.data.reviewDigest,reviewedEnvelope:modelPreview.data.reviewedEnvelope,confirmed:true},
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
 const modelPreview=await call("ccp_import_spreadsheet_preview",{rows,mapping,workplaceId});
 expect(modelPreview.error).toBeUndefined();
 const browserPreview=await page.request.put("/api/import/spreadsheet/parse",{data:{rows,mapping,workplaceId}});
 expect(browserPreview.status(),await browserPreview.text()).toBe(200);
 expect(modelPreview.data).toEqual(await browserPreview.json());
 const key=randomUUID();
 const browserCommit=await page.request.post("/api/import/spreadsheet/commit",{
   data:{rows,mapping,idempotencyKey:key,workplaceId,reviewDigest:modelPreview.data.reviewDigest,reviewedEnvelope:modelPreview.data.reviewedEnvelope,confirmed:true},
 });
 expect(browserCommit.status(),await browserCommit.text()).toBe(200);
 const committed=await browserCommit.json();
 expect(committed.studentsCreated).toBe(2);
 const mcpReplay=await call("ccp_import_spreadsheet_commit",{
   rows,mapping,idempotencyKey:key,workplaceId,reviewDigest:modelPreview.data.reviewDigest,reviewedEnvelope:modelPreview.data.reviewedEnvelope,confirmed:true,
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
  const initialReview=await call("ccp_import_spreadsheet_preview",{rows,mapping,workplaceId});
  const body={rows,mapping,workplaceId,idempotencyKey,reviewDigest:initialReview.data.reviewDigest,reviewedEnvelope:initialReview.data.reviewedEnvelope,confirmed:true as const};
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
  const reducedReview=await call("ccp_import_spreadsheet_preview",{rows:[rows[0]],mapping,workplaceId});
  const retry={...body,rows:[rows[0]],reviewDigest:reducedReview.data.reviewDigest,reviewedEnvelope:reducedReview.data.reviewedEnvelope};
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

test("PARITY: spreadsheet reviews an explicit active workplace before backend import",async({page,request})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="spreadsheet-review-"+randomUUID()+"@example.com",password="SyntheticSpreadsheetReview-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Spreadsheet review fixture",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  const active=await admin.from("workplaces").select("id,name").eq("teacher_id",teacherId).single();
  expect(active.error).toBeNull();
  const workplaceId=active.data!.id;
  const foreign=await admin.from("workplaces").select("id").neq("teacher_id",teacherId).limit(1).single();
  expect(foreign.error).toBeNull();
  const call=await delegatedTool(page,request,undefined,{email,password});
  const learner="Reviewed learner "+randomUUID();
  const rows=[{"Student Name":learner}],mapping={student_name:"Student Name"};
  const reviewUrl="/api/import/spreadsheet/parse",commitUrl="/api/import/spreadsheet/commit";
  const initial=await call("ccp_import_spreadsheet_preview",{rows,mapping});
  expect(initial.error).toBeUndefined();
  expect(initial.data).toMatchObject({proposedDefaultWorkplaceId:workplaceId,selectedWorkplaceId:null,
   reviewDigest:null,writesPerformed:false});
  expect(initial.data.previewRows[0].sourceRow).toBe(2);
  const implicit=await page.request.post(commitUrl,{data:{rows,mapping,confirmed:true}});
  expect(implicit.status()).toBe(422);
  expect((await implicit.json()).code).toBe("WORKPLACE_REQUIRED");

  const other=await admin.from("workplaces").insert({teacher_id:teacherId,name:"Second import workplace",
   timezone:"UTC",locale:"en",currency:"USD"}).select("id").single();
  expect(other.error).toBeNull();
  const ambiguity=await call("ccp_import_spreadsheet_preview",{rows,mapping});
  expect(ambiguity.data).toMatchObject({proposedDefaultWorkplaceId:null,selectedWorkplaceId:null,reviewDigest:null});
  expect(ambiguity.data.workplaces).toHaveLength(2);
  const foreignReview=await page.request.put(reviewUrl,{data:{rows,mapping,workplaceId:foreign.data!.id}});
  expect(foreignReview.status()).toBe(200);
  const foreignResult=await foreignReview.json();
  expect(foreignResult).toMatchObject({selectedWorkplaceId:null,reviewDigest:null,writesPerformed:false});
  expect(foreignResult.workplaces.map((w:{id:string})=>w.id)).not.toContain(foreign.data!.id);
  const foreignWrite=await call("ccp_import_spreadsheet_commit",{rows,mapping,workplaceId:foreign.data!.id,confirmed:true});
  expect(foreignWrite.error?.code).toBe("WORKPLACE_REQUIRED");

  const reviewed=await call("ccp_import_spreadsheet_preview",{rows,mapping,workplaceId});
  expect(reviewed.data).toMatchObject({selectedWorkplaceId:workplaceId,reviewDigest:expect.stringMatching(/^[a-f0-9]{64}$/)});
  const exactWeb=await page.request.put(reviewUrl,{data:{rows,mapping,workplaceId}});
  expect(exactWeb.status()).toBe(200);
  expect(await exactWeb.json()).toEqual(reviewed.data);
  for(const changed of [
   {rows:[{"Student Name":learner+" changed"}],workplaceId},
   {rows,workplaceId:other.data!.id},
  ]){
   const stale=await page.request.post(commitUrl,{data:{...changed,mapping,confirmed:true,reviewDigest:reviewed.data.reviewDigest,reviewedEnvelope:reviewed.data.reviewedEnvelope}});
   expect(stale.status()).toBe(422);
   expect((await stale.json()).code).toBe("IMPORT_REVIEW_REQUIRED");
  }
  const duplicateRows=[...rows,{"Student Name":learner.toUpperCase().replace("REVIEWED","ＲＥＶＩＥＷＥＤ").replace(" LEARNER ","   LEARNER  ")}];
  const duplicate=await call("ccp_import_spreadsheet_preview",{rows:duplicateRows,mapping,workplaceId});
  expect(duplicate.error).toBeUndefined();
  expect(duplicate.data).toMatchObject({reviewDigest:null,issues:[
   {row:2,message:"Duplicate normalized student name in this spreadsheet"},
   {row:3,message:"Duplicate normalized student name in this spreadsheet"},
  ]});
  const duplicateWrite=await page.request.post(commitUrl,{data:{
   rows:duplicateRows,mapping,workplaceId,confirmed:true,reviewDigest:reviewed.data.reviewDigest,reviewedEnvelope:reviewed.data.reviewedEnvelope,
  }});
  expect(duplicateWrite.status()).toBe(422);
  expect((await duplicateWrite.json()).code).toBe("IMPORT_REVIEW_REQUIRED");
  expect((await admin.from("teacher_spreadsheet_import_receipts").select("idempotency_key",{head:true,count:"exact"}).eq("teacher_id",teacherId)).count).toBe(0);
  expect((await call("ccp_students_roster",{query:learner})).data.students).toEqual([]);

  await page.goto("/account");
  const [chooser]=await Promise.all([
   page.waitForEvent("filechooser"),
   page.getByRole("button",{name:"Upload spreadsheet…",exact:true}).click(),
  ]);
  const parseResponse=page.waitForResponse(r=>r.url().endsWith(reviewUrl)&&r.request().method()==="POST");
  const reviewResponse=page.waitForResponse(r=>r.url().endsWith(reviewUrl)&&r.request().method()==="PUT");
  await chooser.setFiles({
   name:"explicit-workplace.csv",mimeType:"text/csv",buffer:Buffer.from("Student Name\n"+learner+"\n"),
  });
  const parsedBrowser=await parseResponse;
  expect(parsedBrowser.status(),await parsedBrowser.text()).toBe(200);
  const reviewedBrowser=await reviewResponse;
  expect(reviewedBrowser.status(),await reviewedBrowser.text()).toBe(200);
  const pick=page.getByLabel("Workplace for imported students (required)");
  const importButton=page.getByRole("button",{name:"Import 1 students",exact:true});
  await expect(pick).toHaveValue("");
  await expect(importButton).toBeDisabled();
  await pick.selectOption(workplaceId);
  await expect(importButton).toBeEnabled();
  await importButton.press("Enter");
  let release!:()=>void;
  const delay=new Promise<void>(resolve=>{release=resolve;});
  let acknowledged!:()=>void;
  const written=new Promise<void>(resolve=>{acknowledged=resolve;});
  const attempts:string[]=[];
  await page.route("**"+commitUrl,async route=>{
   attempts.push(route.request().postData()!);
   if(attempts.length>1){await route.continue();return;}
   const committed=await route.fetch();
   expect(committed.status()).toBe(200);
   acknowledged();await delay;await route.abort("connectionreset");
  });
  await page.getByRole("button",{name:"Import",exact:true}).press("Enter");
  try{
   await written;
   await expect(page.getByRole("status").filter({hasText:"Saving the reviewed import"})).toBeVisible();
   await expect(pick).toBeDisabled();
   await expect(page.getByRole("button",{name:"Upload spreadsheet…",exact:true})).toBeDisabled();
   const committed=await call("ccp_students_roster",{query:learner,workplaceId});
   expect(committed.data.students).toHaveLength(1);
  }finally{release();}
  await expect(page.getByRole("alert").filter({hasText:"Confirmation was interrupted"})).toBeVisible();
  await expect(pick).toBeDisabled();
  await expect(page.getByRole("button",{name:"Cancel",exact:true})).toBeDisabled();
  const responsePromise=page.waitForResponse(r=>r.url().endsWith(commitUrl)&&r.request().method()==="POST"&&r.status()===200);
  await page.getByRole("button",{name:"Retry the exact import",exact:true}).press("Enter");
  const response=await responsePromise;
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toBe(attempts[0]);
  await expect(page.getByRole("status").filter({hasText:"Created 1 students, 0 contacts and 1 enrollments."})).toBeFocused();
  const result=await response.json();
  expect(result).toMatchObject({studentsCreated:1,enrollmentsCreated:1});
  const replay=await call("ccp_import_spreadsheet_commit",response.request().postDataJSON());
  expect(replay.error).toBeUndefined();
  expect(replay.data).toEqual(result);
  const owned=await call("ccp_students_roster",{query:learner,workplaceId});
  expect(owned.error).toBeUndefined();
  expect(owned.data.students).toEqual([expect.objectContaining({name:learner})]);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});

test("PARITY: per-row workplace names and IDs, stable owned aliases, and receipt replay after retirement",async({page,request})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="spreadsheet-per-row-"+randomUUID()+"@example.com",password="SyntheticPerRowReview-123!";
 const account=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(account.error).toBeNull();
 const teacherId=account.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Per-row review fixture",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  const sites=await admin.from("workplaces").insert([
   {teacher_id:teacherId,name:"Reviewed chess school"},{teacher_id:teacherId,name:"Reviewed private club"},
  ]).select("id,name");
  expect(sites.error).toBeNull();
  const school=sites.data!.find(x=>x.name==="Reviewed chess school")!,club=sites.data!.find(x=>x.name==="Reviewed private club")!;
  const alias="Coach roster alias";
  const student=await admin.from("students").insert({teacher_id:teacherId,name:"Existing chess learner",name_aliases:[alias]})
   .select("id").single();
  expect(student.error).toBeNull();
  const call=await delegatedTool(page,request,undefined,{email,password});
  const name="New reviewed chess learner "+randomUUID();
  const rows=[{Name:alias,Venue:school.name},{Name:name,Venue:club.id+"; "+school.id}];
  const args={rows,mapping:{student_name:"Name"},workplaceColumn:"Venue"};
  const rowChoices={"2":student.data!.id};
  const withoutChoice=await call("ccp_import_spreadsheet_preview",args);
  expect(withoutChoice.error).toBeUndefined();
  expect(withoutChoice.data).toMatchObject({reviewedEnvelope:null,writesPerformed:false,identityIssues:[
   expect.objectContaining({sourceRow:2,code:"IMPORT_IDENTITY_CHOICE_REQUIRED",candidates:[
    expect.objectContaining({id:student.data!.id,name:"Existing chess learner"}),
   ]}),
  ]});
  const conflicting=await call("ccp_import_spreadsheet_preview",{...args,workplaceId:club.id,studentChoices:rowChoices});
  expect(conflicting.data).toMatchObject({reviewDigest:null,workplaceIssues:[
   expect.objectContaining({code:"WORKPLACE_MODE_CONFLICT"}),
  ]});
  const unknown=await call("ccp_import_spreadsheet_preview",{
   ...args,rows:[{Name:alias,Venue:"No owned workplace"},rows[1]],studentChoices:rowChoices,
  });
  expect(unknown.data).toMatchObject({reviewDigest:null,workplaceIssues:[
   expect.objectContaining({sourceRow:2,code:"WORKPLACE_NOT_AVAILABLE"}),
  ]});
  const duplicateName=await admin.from("workplaces").insert({teacher_id:teacherId,name:school.name.toUpperCase()}).select("id").single();
  expect(duplicateName.error).toBeNull();
  const ambiguous=await call("ccp_import_spreadsheet_preview",{...args,studentChoices:rowChoices});
  expect(ambiguous.data).toMatchObject({reviewDigest:null,workplaceIssues:[
   expect.objectContaining({sourceRow:2,code:"WORKPLACE_NAME_AMBIGUOUS"}),
  ]});
  expect((await admin.from("workplaces").delete().eq("id",duplicateName.data!.id)).error).toBeNull();
  const reviewedInput={...args,studentChoices:rowChoices};
  const signed=await call("ccp_import_spreadsheet_preview",reviewedInput);
  expect(signed.error).toBeUndefined();
  expect(signed.data).toMatchObject({workplaceTargets:expect.arrayContaining([
   expect.objectContaining({sourceRow:2,workplaceId:school.id}),
   expect.objectContaining({sourceRow:3,workplaceId:club.id}),
   expect.objectContaining({sourceRow:3,workplaceId:school.id}),
  ]),identities:[
   expect.objectContaining({sourceRow:2,mode:"existing",studentId:student.data!.id}),
   expect.objectContaining({sourceRow:3,mode:"create"}),
  ]});
  const web=await page.request.put("/api/import/spreadsheet/parse",{data:reviewedInput});
  expect(web.status()).toBe(200);
  expect(await web.json()).toEqual(signed.data);
  const idempotencyKey=randomUUID();
  const confirmation={...reviewedInput,confirmed:true,idempotencyKey,
   reviewDigest:signed.data.reviewDigest,reviewedEnvelope:signed.data.reviewedEnvelope};
  expect((await admin.from("students").update({teacher_notes:"Synthetic post-review revision"})
   .eq("id",student.data!.id)).error).toBeNull();
  const stale=await call("ccp_import_spreadsheet_commit",confirmation);
  expect(stale.error?.code).toBe("IMPORT_PREVIEW_CHANGED");
  expect((await admin.from("teacher_spreadsheet_import_receipts").select("idempotency_key",{head:true,count:"exact"})
   .eq("teacher_id",teacherId)).count).toBe(0);
  expect((await admin.from("workplace_enrollments").select("id",{head:true,count:"exact"})
   .eq("teacher_id",teacherId)).count).toBe(0);
  const rereview=await call("ccp_import_spreadsheet_preview",reviewedInput);
  const commit={...confirmation,reviewDigest:rereview.data.reviewDigest,reviewedEnvelope:rereview.data.reviewedEnvelope};
  const write=await page.request.post("/api/import/spreadsheet/commit",{data:commit});
  expect(write.status(),await write.text()).toBe(200);
  const receipt=await write.json();
  expect(receipt).toMatchObject({receiptId:idempotencyKey,studentsCreated:1,studentsSkipped:1,enrollmentsCreated:3});
  const dbMembership=await admin.from("workplace_enrollments").select("id,student_id,workplace_id,starts_on,revision")
   .eq("teacher_id",teacherId).eq("workplace_id",school.id);
  expect(dbMembership.data).toHaveLength(2);
  expect(dbMembership.data).toEqual(expect.arrayContaining([
   expect.objectContaining({student_id:student.data!.id,starts_on:rereview.data.reviewedEnvelope.calendar.day}),
  ]));
  const mixedRoster=await call("ccp_students_roster",{query:name,workplaceId:club.id});
  const schoolRoster=await call("ccp_students_roster",{query:name,workplaceId:school.id});
  expect(mixedRoster.data.students).toHaveLength(1);
  expect(schoolRoster.data.students[0].id).toBe(mixedRoster.data.students[0].id);
  for(const membership of dbMembership.data!){
   const end=await call("ccp_workplaces_unenroll",{workplaceId:school.id,studentId:membership.student_id,confirmed:true,
    expectedRevision:membership.revision,idempotencyKey:randomUUID(),reason:"Synthetic verified retirement approval"});
   expect(end.error).toBeUndefined();
  }
  expect((await admin.from("workplaces").update({archived_at:new Date().toISOString()}).eq("id",school.id)).error).toBeNull();
  const freshAfterArchive=await page.request.post("/api/import/spreadsheet/commit",{data:{...commit,idempotencyKey:randomUUID()}});
  expect(freshAfterArchive.status()).toBe(409);
  expect((await freshAfterArchive.json()).code).toBe("IMPORT_PREVIEW_CHANGED");
  const replay=await call("ccp_import_spreadsheet_commit",commit);
  expect(replay.error).toBeUndefined();
  expect(replay.data).toEqual(receipt);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});

test("PARITY: keyboard review exposes all rows and unlocks a lost authoritative rollback",async({page,request})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="sheet-keyboard-"+randomUUID()+"@example.com",password="SyntheticSheetKeyboard-123!";
 const account=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(account.error).toBeNull();
 const teacherId=account.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Keyboard import test",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  const sites=await admin.from("workplaces").insert([
   {teacher_id:teacherId,name:"Keyboard first workplace"},{teacher_id:teacherId,name:"Keyboard second workplace"},
  ]).select("id,name").order("name");
  expect(sites.error).toBeNull();
  const [first,second]=sites.data!;
  const homonym="Identical reviewed learner";
  const students=await admin.from("students").insert([
   {teacher_id:teacherId,name:homonym},{teacher_id:teacherId,name:homonym},
  ]).select("id").order("id");
  expect(students.error).toBeNull();
  const [one,two]=students.data!;
  const call=await delegatedTool(page,request,undefined,{email,password});
  const names=[homonym,homonym,...Array.from({length:50},(_,i)=>"Keyboard new learner "+(i+1))];
  const rows=names.map((name,i)=>({"Student Name":name,Venue:i===51?first.id+"; "+second.id:first.id}));
  const csv="Student Name,Venue\n"+rows.map(r=>r["Student Name"]+","+r.Venue).join("\n")+"\n";
  await page.goto("/account");
  const [chooser]=await Promise.all([
   page.waitForEvent("filechooser"),
   page.getByRole("button",{name:"Upload spreadsheet…",exact:true}).click(),
  ]);
  await chooser.setFiles({name:"keyboard-reviewed.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
  const column=page.getByLabel("Workplace column (optional)");
  const reviewedNetwork=page.waitForResponse(res=>res.url().endsWith("/api/import/spreadsheet/parse")&&
    res.request().method()==="PUT"&&res.request().postDataJSON()?.workplaceColumn==="Venue");
  await column.selectOption("Venue");
  const resolvedPreview=await reviewedNetwork;
  expect(resolvedPreview.status(),await resolvedPreview.text()).toBe(200);
  const diagnostic=await resolvedPreview.json();
  expect(diagnostic.identityIssues).toMatchObject([
    {sourceRow:2,code:"IMPORT_IDENTITY_CHOICE_REQUIRED"},{sourceRow:3,code:"IMPORT_IDENTITY_CHOICE_REQUIRED"},
  ]);
  const identityOne=page.getByLabel("Existing student for row 2",{exact:true});
  const identityTwo=page.getByLabel("Existing student for row 3",{exact:true});
  await identityOne.selectOption(one.id);
  await expect(identityOne).toBeFocused();
  await identityTwo.selectOption(two.id);
  await expect(identityTwo).toBeFocused();
  await expect(identityOne).toHaveValue(one.id);
  await identityOne.press("Home");
  await expect(identityOne).toHaveValue("");
  await expect(page.getByRole("button",{name:"Import 52 students",exact:true})).toBeDisabled();
  await identityOne.selectOption(one.id);
  await expect(identityOne).toBeFocused();
  const table=page.getByRole("region",{name:"Review every spreadsheet row"});
  await table.focus();
  await expect(table).toBeFocused();
  await table.press("End");
  const last=table.getByRole("row").filter({hasText:"Keyboard new learner 50"});
  await expect(last).toContainText("Keyboard first workplace");
  await expect(last).toContainText("Keyboard second workplace");
  await expect(last).toContainText("Add current enrollment");
  await expect(table.getByText("Existing student: "+homonym+", ID "+one.id,{exact:true})).toBeVisible();
  await expect(table.getByText("Existing student: "+homonym+", ID "+two.id,{exact:true})).toBeVisible();
  const model=await call("ccp_import_spreadsheet_preview",{rows,mapping:{student_name:"Student Name"},
   workplaceColumn:"Venue",studentChoices:{"2":one.id,"3":two.id}});
  expect(model.data.reviewedEnvelope.rows).toHaveLength(52);
  const {day,timezone}=model.data.reviewedEnvelope.calendar;
  await expect(page.getByRole("status").filter({hasText:"Enrollment day: "+day+" in "+timezone})).toBeVisible();
  const importButton=page.getByRole("button",{name:"Import 52 students",exact:true});
  await expect(importButton).toBeEnabled();

  expect((await admin.from("workplaces").update({currency:"EUR"}).eq("id",second.id)).error).toBeNull();
  const endpoint="/api/import/spreadsheet/commit",attempts:string[]=[];
  let release!:()=>void,recordFailure!:()=>void;
  const open=new Promise<void>(resolve=>{release=resolve;});
  const rejected=new Promise<void>(resolve=>{recordFailure=resolve;});
  await page.route("**"+endpoint,async route=>{
   attempts.push(route.request().postData()!);
   if(attempts.length>1){await route.continue();return;}
   const res=await route.fetch();
   expect(res.status()).toBe(409);
   expect(await res.json()).toMatchObject({code:"IMPORT_PREVIEW_CHANGED",authoritativeDenial:true});
   recordFailure();await open;await route.abort("connectionreset");
  });
  await importButton.press("Enter");
  await page.getByRole("button",{name:"Import",exact:true}).press("Enter");
  try{await rejected;await expect(column).toBeDisabled();}finally{release();}
  await expect(page.getByRole("alert").filter({hasText:"Confirmation was interrupted"})).toBeVisible();
  await expect(identityOne).toBeDisabled();
  const retry=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==="POST"&&r.status()===409);
  await page.getByRole("button",{name:"Retry the exact import",exact:true}).press("Enter");
  expect(await (await retry).json()).toMatchObject({code:"IMPORT_PREVIEW_CHANGED",authoritativeDenial:true});
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toBe(attempts[1]);
  await expect(page.getByRole("button",{name:"Retry the exact import",exact:true})).toHaveCount(0);
  await expect(column).toBeEnabled();
  await expect(page.getByRole("alert").filter({hasText:/Import review changed/i})).toBeFocused();
  await expect(identityOne).toHaveValue(one.id);
  await expect(identityTwo).toHaveValue(two.id);
  for(const [tableName,count] of [["students",2],["workplace_enrollments",0],["teacher_spreadsheet_import_receipts",0]] as const){
   const result=await admin.from(tableName).select("*",{count:"exact",head:true}).eq("teacher_id",teacherId);
   expect(result.error).toBeNull();expect(result.count,tableName).toBe(count);
  }
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});

test("PARITY: an explicitly chosen active context never silently supplies or changes the pinned import target",async({page,request})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="sheet-active-context-"+randomUUID()+"@example.com",password="SyntheticActiveContext-123!";
 const account=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(account.error).toBeNull();
 const teacherId=account.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Import context fixture",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  const sites=await admin.from("workplaces").insert([
   {teacher_id:teacherId,name:"Original active venue"},{teacher_id:teacherId,name:"Replacement active venue"},
  ]).select("id,name").order("name");
  expect(sites.error).toBeNull();
  const [original,replacement]=sites.data!;
  const call=await delegatedTool(page,request,undefined,{email,password});
  const initial=(await call("ccp_workplace_context_get",{})).data.selectedWorkplaceId;
  const set=await call("ccp_workplace_context_set",{
   selectedWorkplaceId:original.id,expectedSelectedWorkplaceId:initial,confirmed:true,
  });
  expect(set.error).toBeUndefined();
  const learner="Import active context learner "+randomUUID();
  const input={rows:[{"Student Name":learner}],mapping:{student_name:"Student Name"}};
  const fromModel=await call("ccp_import_spreadsheet_preview",input);
  expect(fromModel.error).toBeUndefined();
  expect(fromModel.data).toMatchObject({selectedWorkplaceId:null,proposedDefaultWorkplaceId:null,
   proposedActiveContextWorkplaceId:original.id,reviewedEnvelope:null,writesPerformed:false});
  const fromBrowser=await page.request.put("/api/import/spreadsheet/parse",{data:input});
  expect(fromBrowser.status()).toBe(200);expect(await fromBrowser.json()).toEqual(fromModel.data);
  const noImplicit=await call("ccp_import_spreadsheet_commit",{...input,confirmed:true});
  expect(noImplicit.error?.code).toBe("WORKPLACE_REQUIRED");

  await page.goto("/account");
  const [chooser]=await Promise.all([
   page.waitForEvent("filechooser"),
   page.getByRole("button",{name:"Upload spreadsheet…",exact:true}).click(),
  ]);
  await chooser.setFiles({name:"active-context.csv",mimeType:"text/csv",buffer:Buffer.from("Student Name\n"+learner+"\n")});
  const target=page.getByLabel("Workplace for imported students (required)");
  const submit=page.getByRole("button",{name:"Import 1 students",exact:true});
  await expect(target).toHaveValue("");await expect(submit).toBeDisabled();
  await page.getByRole("button",{name:"Use active workplace: "+original.name,exact:true}).press("Enter");
  await expect(target).toHaveValue(original.id);await expect(submit).toBeEnabled();
  expect((await call("ccp_workplace_context_get",{})).data.selectedWorkplaceId).toBe(original.id);

  // A concurrent filter change and actual retirement must not retarget the approved draft.
  expect((await call("ccp_workplace_context_set",{
   selectedWorkplaceId:replacement.id,expectedSelectedWorkplaceId:original.id,confirmed:true,
  })).error).toBeUndefined();
  expect((await admin.from("workplaces").update({archived_at:new Date().toISOString()}).eq("id",original.id)).error).toBeNull();
  await expect(target).toHaveValue(original.id);
  const endpoint="/api/import/spreadsheet/commit";
  let response=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==="POST");
  await submit.press("Enter");await page.getByRole("button",{name:"Import",exact:true}).press("Enter");
  const failed=await response;
  expect(failed.status(),await failed.text()).toBe(409);
  expect(failed.request().postDataJSON().workplaceId).toBe(original.id);
  expect((await failed.json()).code).toBe("IMPORT_PREVIEW_CHANGED");
  expect((await call("ccp_students_roster",{query:learner})).data.students).toEqual([]);
  await expect(target).toHaveValue("");await expect(submit).toBeDisabled();

  await page.getByRole("button",{name:"Use active workplace: "+replacement.name,exact:true}).press("Enter");
  await expect(target).toHaveValue(replacement.id);await expect(submit).toBeEnabled();
  response=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==="POST");
  await submit.press("Enter");await page.getByRole("button",{name:"Import",exact:true}).press("Enter");
  const saved=await response;
  expect(saved.status(),await saved.text()).toBe(200);
  expect((await call("ccp_import_spreadsheet_commit",saved.request().postDataJSON())).data).toEqual(await saved.json());
  expect((await call("ccp_workplace_context_get",{})).data.selectedWorkplaceId).toBe(replacement.id);
  const actual=(await call("ccp_students_roster",{query:learner,workplaceId:replacement.id})).data.students;
  expect(actual).toEqual([expect.objectContaining({name:learner})]);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
