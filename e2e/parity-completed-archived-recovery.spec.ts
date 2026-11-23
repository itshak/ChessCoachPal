import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: newly completed archived lesson is read-only until exact signed HTTP/MCP approval and replay",
 async({page,request,browser,baseURL})=>{
  const fixturePath=process.env.CCP_COMPLETED_RECOVERY_FIXTURE;
  test.skip(!fixturePath,"Explicit disposable postgres archive fixture required; see scripts/completed-archived-recovery-app-fixture.sql");
  const {email,password,studentNames,...input}=JSON.parse(readFileSync(fixturePath!,"utf8")) as {
   email:string;password:string;studentNames:[string,string];workplaceId:string;studentIds:[string,string];startsAt:string;localStart:string;
  };
  const [archived,active]=input.studentIds;
  const endpoint="/api/coaching/lesson-capture/recovery/completed";
  const previewTool="ccp_lessons_completed_archived_recovery_preview";
  const commitTool="ccp_lessons_completed_archived_recovery_commit";
  const call=await delegatedTool(page,request,undefined,{email,password});
  const names=await call.listTools();
  expect(names.map(x=>x.name)).toEqual(expect.arrayContaining([previewTool,commitTool]));
  const args={...input,durationMinutes:45,title:"Signed completed lesson "+randomUUID(),
   attendance:[{studentId:archived,status:"present"},{studentId:active,status:"excused"}]};
  const before=(await call("ccp_students_lifecycle_preview",{studentId:archived})).data;
  expect(before.archived).toBe(true);
  const response=await page.request.post(endpoint,{data:args});
  expect(response.status(),await response.text()).toBe(200);
  const preview=await response.json();
  expect(preview).toMatchObject({canCommit:true,issues:[],writesPerformed:false,
   proposedCommit:{reactivations:[{studentId:archived,expectedUpdatedAt:before.expectedUpdatedAt}]}});
  expect((await call(previewTool,args)).data).toEqual(preview);
  const draft={...preview.proposedCommit,requestId:randomUUID(),
   reason:"Teacher directly observed this same-day session",confirmed:true};
  const incorrectWall=await page.request.post(endpoint,{data:{...args,localStart:"2000-01-01T00:00"}});
  expect(incorrectWall.status()).toBe(200);
  expect((await incorrectWall.json())).toMatchObject({canCommit:false,proposedCommit:null,
   issues:expect.arrayContaining([{code:"COMPLETED_RECOVERY_UNREVIEWED_LOCAL_TIME"}])});
  const pending=await page.request.put(endpoint,{data:{...draft,confirmed:false}});
  expect(pending.status()).toBe(400);
  expect((await call("ccp_students_lifecycle_preview",{studentId:archived})).data).toEqual(before);

  const readContext=await browser.newContext({baseURL});
  try{
   const readPage=await readContext.newPage();
   const read=await delegatedTool(readPage,request,"coach:read",{email,password});
   expect((await read(previewTool,args)).data).toEqual(preview);
   expect((await read(commitTool,draft)).error?.code).toBe("FORBIDDEN");
   const anonymous=await browser.newContext({baseURL});
   try{
    expect((await anonymous.request.post(endpoint,{data:args})).status()).toBe(401);
    expect((await anonymous.request.put(endpoint,{data:draft})).status()).toBe(401);
   }finally{await anonymous.close();}
  }finally{await readContext.close();}
  await page.goto("/coaching");
  await page.getByLabel("Student names, one per line (1–50)").fill(studentNames.join("\n"));
  await page.getByLabel("Workplace / time zone").selectOption(input.workplaceId);
  await page.getByLabel("Lesson title").fill(args.title);
  await page.getByLabel("Start time in workplace time zone").fill(input.localStart);
  await page.getByLabel("Instructor minutes (15–480)").fill("45");
  await page.getByRole("button",{name:"Preview only",exact:true}).press("Enter");
  await expect(page.getByRole("radio",{name:"Future scheduled lesson"})).toBeChecked();
  await page.getByRole("radio",{name:"Completed today"}).press("Space");
  const review=page.getByRole("button",{name:"Review completed lesson"});
  await expect(review).toBeDisabled();
  const archivedOutcome=page.getByRole("combobox",{name:/Attendance for Signed archived student/});
  const activeOutcome=page.getByRole("combobox",{name:/Attendance for Signed active student/});
  await archivedOutcome.press("ArrowDown");
  await expect(archivedOutcome).toHaveValue("present");
  await activeOutcome.press("End");
  await expect(activeOutcome).toHaveValue("excused");
  await review.press("Enter");
  await expect(page.getByText(/Teacher calendar day:/)).toContainText(preview.calendar.teacherDay);
  const commit=page.getByRole("button",{name:"Confirm reactivation and record completed lesson"});
  await expect(commit).toBeDisabled();
  await page.getByRole("textbox",{name:/Reason for reactivation and completed lesson/}).fill(draft.reason);
  await expect(commit).toBeDisabled();
  await page.getByRole("checkbox",{name:/I approve reactivating the reviewed learners/}).press("Space");
  expect((await call("ccp_students_lifecycle_preview",{studentId:archived})).data).toEqual(before);
  let firstBody:string|undefined;
  let releaseFirst!:()=>void;
  const firstReply=new Promise<void>(resolve=>{releaseFirst=resolve;});
  let committedWhileWaiting!:()=>void;
  const firstCommitted=new Promise<void>(resolve=>{committedWhileWaiting=resolve;});
  const interceptedBodies:string[]=[];
  await page.route("**"+endpoint,async route=>{
   if(route.request().method()!=="PUT"){await route.continue();return;}
   interceptedBodies.push(route.request().postData()!);
   if(firstBody===undefined){
    firstBody=route.request().postData()!;
    // Send the signed mutation and wait until it succeeds. Deliberately do
    // not deliver its acknowledgement to the browser.
    const applied=await route.fetch();
    expect(applied.status()).toBe(200);
    committedWhileWaiting();
    await firstReply;
    await route.abort("connectionreset");
   }else await route.continue();
  });
  await commit.press("Enter");
  try{
   await firstCommitted;
   await expect(page.getByText("Checking the reviewed lesson. Please wait.",{exact:true})).toBeVisible();
   await expect(page.getByLabel("Lesson title")).toBeDisabled();
   await expect(page.getByLabel("Workplace / time zone")).toBeDisabled();
   await expect(page.getByRole("radio",{name:"Future scheduled lesson"})).toBeDisabled();
   await expect(page.getByRole("button",{name:"Preview only",exact:true})).toBeDisabled();
   expect((await call("ccp_students_lifecycle_preview",{studentId:archived})).data.archived).toBe(false);
  }finally{releaseFirst();}
  await expect(page.getByRole("alert").filter({hasText:"Confirmation was interrupted"})).toBeVisible();
  await expect(page.getByRole("textbox",{name:/Reason for reactivation and completed lesson/})).toBeDisabled();
  await expect(archivedOutcome).toBeDisabled();
  await expect(page.getByLabel("Lesson title")).toBeDisabled();
  await expect(page.getByRole("radio",{name:"Future scheduled lesson"})).toBeDisabled();
  const retry=page.getByRole("button",{name:"Retry the exact approval"});
  const responsePromise=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==="PUT"&&r.status()===200);
  await retry.press("Enter");
  const committed=await responsePromise;
  const data=await committed.json();
  expect(data).toMatchObject({status:"completed",oneTransaction:true,replayed:true,reactivatedStudentIds:[archived]});
  expect(interceptedBodies).toHaveLength(2);
  expect(interceptedBodies[1]).toBe(firstBody);
  const receipt=page.getByRole("status").filter({hasText:"Completed lesson recorded: "+data.sessionId});
  await expect(receipt).toBeVisible();
  await expect(receipt).toBeFocused();
  await expect(page.getByLabel("Lesson title")).toBeEnabled();
  const sent=committed.request().postDataJSON();
  const replay=await call(commitTool,sent);
  expect(replay.error).toBeUndefined();
  expect(replay.data).toMatchObject({...data,replayed:true});
  const changed=await call(commitTool,{...sent,title:"Changed approval"});
  expect(changed.error?.code).toBe("CONFLICT");
  const result=await call("ccp_sessions_details",{sessionId:data.sessionId});
  expect(result.data).toMatchObject({status:"completed",workplace_id:input.workplaceId,duration_minutes:45});
  expect(result.data.participants.map((r:{student_id:string})=>r.student_id).sort()).toEqual([...input.studentIds].sort());
  const snapshot=await call("ccp_attendance_preview",{sessionId:data.sessionId});
  expect(snapshot.data.attendance).toEqual(expect.arrayContaining([
   expect.objectContaining({student_id:archived,status:"present"}),
   expect.objectContaining({student_id:active,status:"excused"}),
  ]));
  const after=await call("ccp_students_lifecycle_preview",{studentId:archived});
  expect(after.data).toMatchObject({archived:false,
   currentMemberships:[{workplaceId:input.workplaceId,startsOn:preview.calendar.teacherDay}]});
 });
