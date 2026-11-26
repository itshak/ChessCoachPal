import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";
const origin=process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000";

test("PARITY:PARITY-federation-identity independent FIDE and national IDs, snapshots, website/MCP replay and security",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_students_create",{
  name:"FIDE learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const id=student.data.entityId as string;
 const endpoint=`/api/students/${id}/federations`;
 const initial=await page.request.get(endpoint);
 expect(initial.status(),await initial.text()).toBe(200);
 const first=await initial.json();
 expect(first.identity).toMatchObject({fideId:null,
   fideFederationCode:null,nationalFederationPreference:null});
 expect(first.memberships).toEqual([]);expect(first.snapshots).toEqual([]);
 const mcpFirst=await call("ccp_student_federations_get",{studentId:id});
 expect(mcpFirst.error).toBeUndefined();expect(mcpFirst.data).toEqual(first);
 const edit=await page.request.put(`/api/students/${id}`,{
  headers:{origin},data:{fideId:"12345678",fideFederationCode:"ISR",
   nationalFederationPreference:"NONE"},
 });
 expect(edit.status(),await edit.text()).toBe(200);
 const afterProfile=await call("ccp_student_federations_get",{studentId:id});
 expect(afterProfile.error).toBeUndefined();
 expect(afterProfile.data.identity).toMatchObject({
  fideId:"12345678",fideFederationCode:"ISR",
  nationalFederationPreference:"NONE",suggestedFederationCode:null,
 });
 // The teacher hint is not a national membership, and explicit NONE wins.
 // Shared E2E teacher state must not be mutated by tests running in parallel.
 const defaultBefore=await call("ccp_teacher_federation_default_get",{});
 expect(defaultBefore.error).toBeUndefined();
 const defaultBrowser=await page.request.get("/api/teacher/federation-default");
 expect(defaultBrowser.status(),await defaultBrowser.text()).toBe(200);
 expect(defaultBefore.data).toEqual(await defaultBrowser.json());
 const rejected=await page.request.put("/api/teacher/federation-default",{
  headers:{origin},data:{defaultNationalFederationCode:"ISR",
   expectedDefaultNationalFederationCode:defaultBefore.data.defaultNationalFederationCode,
   confirmed:false},
 });
 expect(rejected.status()).toBe(400);
 const badMcp=await call("ccp_teacher_federation_default_set",{
  defaultNationalFederationCode:"ISR",expectedDefaultNationalFederationCode:null,
  confirmed:false,
 });
 expect(badMcp.error?.code).toBe("VALIDATION_ERROR");
 const memberInput={studentId:id,federationCode:"ISR",
  playerId:"CHESS-"+randomUUID(),idempotencyKey:randomUUID(),confirmed:true};
 const added=await call("ccp_student_federations_link",memberInput);
 expect(added.error).toBeUndefined();
 expect(added.data).toMatchObject({federationCode:"ISR",studentId:id,
  membershipStatus:"unverified",verifiedAt:null,replayed:false});
 const memberId=added.data.id as string;
 const replay=await page.request.post(endpoint,{headers:{origin},data:memberInput});
 expect(replay.status(),await replay.text()).toBe(201);
 expect((await replay.json()).replayed).toBe(true);
 const viaMcp=await call("ccp_student_federations_update",{
  studentId:id,membershipId:memberId,playerId:"MCP-"+randomUUID(),
  expectedRevision:1,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(viaMcp.error).toBeUndefined();
 expect(viaMcp.data).toMatchObject({membershipStatus:"unverified",revision:2});
 const updated=await page.request.patch(`${endpoint}/${memberId}`,{
  headers:{origin},data:{studentId:id,membershipId:memberId,
   playerId:"Edited-"+randomUUID(),expectedRevision:2,
   idempotencyKey:randomUUID(),confirmed:true},
 });
 expect(updated.status(),await updated.text()).toBe(200);
 expect(await updated.json()).toMatchObject({membershipStatus:"unverified",revision:3});
 const read=await call("ccp_student_federations_get",{studentId:id});
 expect(read.error).toBeUndefined();
 const websiteRead=await page.request.get(endpoint);
 expect(websiteRead.status(),await websiteRead.text()).toBe(200);
 expect(read.data).toEqual(await websiteRead.json());
 expect(read.data.memberships).toHaveLength(1);
 const mark={studentId:id,provider:"fide",timeControl:"rapid",rating:1762,
  observedAt:new Date(Date.now()-86400000).toISOString(),effectiveAt:null,
  sourceUrl:"https://ratings.fide.com/",requestId:randomUUID(),confirmed:true};
 const result=await page.request.post(`/api/students/${id}/federation-ratings`,{
  headers:{origin},data:mark,
 });
 expect(result.status(),await result.text()).toBe(201);
 expect((await result.json()).snapshot).toMatchObject({
  provider:"fide",time_control:"rapid",rating:1762,
  verification_state:"unverified",source:"teacher_manual"});
 const recorded=await call("ccp_student_federation_ratings_record",mark);
 expect(recorded.error).toBeUndefined();expect(recorded.data.replayed).toBe(true);
 const invalid=await call("ccp_student_federation_ratings_record",{
  ...mark,provider:"icf",timeControl:"blitz",requestId:randomUUID(),
 });
 expect(invalid.error?.code).toBe("VALIDATION_ERROR");
 const state=await call("ccp_student_federations_get",{studentId:id});
 expect(state.error).toBeUndefined();expect(state.data.snapshots).toHaveLength(1);
 expect(state.data.snapshots[0]).toMatchObject({rating:1762,
  verification_state:"unverified",source:"teacher_manual"});
 expect(state.data.sourceWarning).toMatch(/UNVERIFIED/);
 const notOwned=await call("ccp_student_federations_get",{studentId:randomUUID()});
 expect(notOwned.error?.code).toBe("NOT_FOUND");
 const noForeignBrowser=await page.request.get(`/api/students/${randomUUID()}/federations`);
 expect(noForeignBrowser.status()).toBe(404);
 await page.goto(`/students/${id}`);
 await expect(page.getByTestId("fide-id-input")).toHaveValue("12345678");
});

test("PARITY:PARITY-federation-read-only scoped delegation cannot write and national ID does not prove registration",async({page,request})=>{
 const call=await delegatedTool(page,request,"coach:read");
 const names=(await call.listTools()).map((x:{name:string})=>x.name);
 expect(names).toContain("ccp_student_federations_get");
 expect(names).toContain("ccp_teacher_federation_default_get");
 expect(names).not.toContain("ccp_student_federations_link");
 expect(names).not.toContain("ccp_student_federation_ratings_record");
 const blocked=await call("ccp_student_federations_link",{
  studentId:randomUUID(),federationCode:"ISR",playerId:"test",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(blocked.error?.code).toBe("FORBIDDEN");
});

test("PARITY:PARITY-federation-evidence retains old IDs and refuses to guess corrected edition order",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const teacher=await db.from("teachers").select("id").eq("email",SEED_TEACHER.email).single();
 expect(teacher.error).toBeNull();
 const teacherId=teacher.data!.id;
 const created=await call("ccp_students_create",{name:"Synthetic evidence "+randomUUID(),idempotencyKey:randomUUID()});
 expect(created.error).toBeUndefined();
 const studentId=created.data.entityId as string;
 const endpoint=`/api/students/${studentId}/federations`;
 const oldId="900000000101",newId="900000000102";
 const setId=async(fideId:string)=>{
  const response=await page.request.put(`/api/students/${studentId}`,{headers:{origin},data:{fideId}});
  expect(response.status(),await response.text()).toBe(200);
 };
 await setId(oldId);
 const official=(rating:number, external_player_id:string,provider_list_version:string,effective_at:string,
                 time_control="standard",observed_at="2025-05-20T00:00:00Z")=>({
  teacher_id:teacherId,student_id:studentId,provider:"fide",time_control,rating,external_player_id,
  provider_list_version,effective_at,observed_at,fetched_at:observed_at,
  source:"provider_api",verification_state:"provider_published",source_url:"https://example.invalid/fide",
  source_digest:"a".repeat(64),request_id:randomUUID(),games:0,
 });
 const seeded=await db.from("student_rating_snapshots").insert([
  official(1871,oldId,"fixture-jan","2025-01-01"),
  official(1810,oldId,"fixture-dec","2024-12-01","standard","2025-05-21T00:00:00Z"),
  official(1963,newId,"fixture-feb","2025-02-01"),
  official(1760,newId,"fixture-v9","2025-02-01","blitz"),
  official(1764,newId,"fixture-v10","2025-02-01","blitz"),
 ]);
 expect(seeded.error).toBeNull();
 const manual=await call("ccp_student_federation_ratings_record",{
  studentId,provider:"icf",timeControl:"national",rating:1644,observedAt:"2025-05-20T00:00:00Z",
  effectiveAt:null,sourceUrl:"https://example.invalid/icf",requestId:randomUUID(),confirmed:true,
 });
 expect(manual.error).toBeUndefined();
 const read=async(fideOn?:string)=>{
  const browser=await page.request.get(endpoint+(fideOn?"?fideOn="+fideOn:""));
  expect(browser.status(),await browser.text()).toBe(200);
  const mcp=await call("ccp_student_federations_get",{studentId,...(fideOn?{fideOn}:{})});
  expect(mcp.error).toBeUndefined();expect(mcp.data).toEqual(await browser.json());
  return mcp.data;
 };
 const before=await read();
 expect(before.currentEvidence.fide[0]).toMatchObject({status:"recorded",
  snapshot:{rating:1871,external_player_id:oldId,provider_list_version:"fixture-jan"}});
 expect(before.fideEffectiveEvidence).toBeUndefined();
 expect(before.fideEvidenceExport).toBeUndefined();
 const december=await read("2024-12-31");
 expect(december.currentEvidence).toEqual(before.currentEvidence);
 expect(december.fideEffectiveEvidence).toMatchObject({
  basis:"stored_editions_for_current_link",throughDate:"2024-12-31",fide:[
   {timeControl:"standard",status:"recorded",snapshot:{rating:1810,effective_at:"2024-12-01"}},
   {timeControl:"rapid",status:"not_recorded",snapshot:null},
   {timeControl:"blitz",status:"not_recorded",snapshot:null},
  ],
 });
 for(const bad of ["2025-02-29","2999-01-01"]){
  expect((await page.request.get(endpoint+"?fideOn="+bad)).status()).toBe(400);
  expect((await call("ccp_student_federations_get",{studentId,fideOn:bad})).error?.code).toBe("VALIDATION_ERROR");
 }
 expect((await page.request.get(endpoint+"?fideOn=2025-01-01&fideOn=2025-02-01")).status()).toBe(400);
 const profile=async()=>db.from("students").select("strength,chess_ratings").eq("id",studentId).single();
 const strengthBefore=await profile();
 expect(strengthBefore.error).toBeNull();
 await setId(newId);
 const corrected=await read();
 expect(corrected.retrieval).toEqual({fide:"not_automated",icf:"manual_only"});
 expect(corrected.currentEvidence.fide).toMatchObject([
  {timeControl:"standard",status:"recorded",snapshot:{rating:1963,external_player_id:newId}},
  {timeControl:"rapid",status:"not_recorded",snapshot:null},
  {timeControl:"blitz",status:"edition_order_unknown",snapshot:null},
 ]);
 const earlierForNewId=await read("2025-01-31");
 expect(earlierForNewId.fideEffectiveEvidence.fide.every((row:{status:string})=>row.status==="not_recorded")).toBe(true);
 const newFebruary=await read("2025-02-01");
 expect(newFebruary.fideEffectiveEvidence.fide).toMatchObject([
  {timeControl:"standard",status:"recorded",snapshot:{rating:1963}},
  {timeControl:"rapid",status:"not_recorded",snapshot:null},
  {timeControl:"blitz",status:"edition_order_unknown",snapshot:null},
 ]);
 const expectedFile={
  format:"chesscoachpal_fide_effective_evidence_v1",intendedAudience:"coach_private",
  provider:"fide",basis:"stored_editions_for_current_link",historicalKnowledgeOrIdentity:false,throughDate:"2025-02-01",
  categories:[
   {timeControl:"standard",status:"recorded",evidence:{rating:1963,effectiveDate:"2025-02-01",provenance:"stored_provider_publication"}},
   {timeControl:"rapid",status:"not_recorded",evidence:null},
   {timeControl:"blitz",status:"edition_order_unknown",evidence:null},
  ],
 };
 expect(newFebruary.fideEvidenceExport).toEqual(expectedFile);
 expect(corrected.snapshots).toHaveLength(6);
 expect(corrected.snapshots).toEqual(expect.arrayContaining([
  expect.objectContaining({external_player_id:oldId,provider_list_version:"fixture-jan"}),
  expect.objectContaining({provider:"icf",source:"teacher_manual",verification_state:"unverified"}),
 ]));
 expect(corrected.memberships).toEqual([]);
 expect((await profile()).data).toEqual(strengthBefore.data);
 await page.goto(`/students/${studentId}`);
 const panel=page.getByTestId("federation-rating-evidence");
 await expect(panel).toContainText("1963");
 await expect(panel).toContainText("manual evidence only");
 await expect(panel).toContainText("order not verified");
 await expect(panel).not.toContainText("1871");
 await page.getByLabel("FIDE effective date",{exact:true}).fill("2025-02-01");
 await page.getByRole("button",{name:"Review effective date",exact:true}).click();
 const historical=page.getByRole("region",{name:"FIDE effective-date result",exact:true});
 await expect(historical).toContainText("1963");
 await expect(historical).toContainText("order not verified");
 await expect(historical).not.toContainText("1871");
 const downloadButton=historical.getByRole("button",{name:"Download private evidence (JSON)",exact:true});
 const [download]=await Promise.all([page.waitForEvent("download"),downloadButton.click()]);
 expect(download.suggestedFilename()).toBe("chesscoachpal-fide-evidence-2025-02-01.json");
 const path=await download.path();
 expect(path).not.toBeNull();
 const bytes=await readFile(path!,"utf8");
 expect(JSON.parse(bytes)).toEqual(expectedFile);
 for(const forbidden of [oldId,newId,studentId,"fixture-feb","https://example.invalid","1644","1871"]){
  expect(bytes).not.toContain(forbidden);
 }

 // The write still reaches the real app. A failed follow-up GET must never
 // leave the old bound result rendered as current for the just-saved ID.
 const failedReload=async(route:import("@playwright/test").Route)=>route.fulfill({status:503});
 await page.route("**"+endpoint,failedReload);
 await page.getByTestId("fide-id-input").fill(oldId);
 await page.getByRole("button",{name:"Save player identity"}).click();
 await expect(panel).toHaveCount(0);
 await expect(historical).toHaveCount(0);
 await expect(downloadButton).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Save player identity"})).toBeEnabled();
 const saved=await db.from("students").select("fide_id").eq("id",studentId).single();
 expect(saved.data?.fide_id).toBe(oldId);
 await page.unroute("**"+endpoint,failedReload);
 await page.reload();
 await expect(panel).toContainText("1871");
 await expect(panel).not.toContainText("1963");
 // A successful but mismatched GET is equally unusable after the identity write.
 const staleReload=async(route:import("@playwright/test").Route)=>route.fulfill({json:before});
 await page.route("**"+endpoint,staleReload);
 await page.getByTestId("fide-id-input").fill(newId);
 await page.getByRole("button",{name:"Save player identity"}).click();
 await expect(panel).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Save player identity"})).toBeEnabled();
 expect((await db.from("students").select("fide_id").eq("id",studentId).single()).data?.fide_id).toBe(newId);
 await page.unroute("**"+endpoint,staleReload);
 const foreignEmail="federation-foreign-"+randomUUID()+"@example.com";
 const foreign=await db.auth.admin.createUser({email:foreignEmail,password:"SyntheticForeign-123!",email_confirm:true});
 expect(foreign.error).toBeNull();
 const foreignId=foreign.data.user!.id;
 try{
  expect((await db.from("teachers").insert({id:foreignId,email:foreignEmail,display_name:"Synthetic other teacher"})).error).toBeNull();
  const learner=await db.from("students").insert({teacher_id:foreignId,name:"Other synthetic learner"}).select("id").single();
  expect(learner.error).toBeNull();
  const foreignStudentId=learner.data!.id;
  expect((await page.request.get(`/api/students/${foreignStudentId}/federations?fideOn=2025-02-01`)).status()).toBe(404);
  expect((await call("ccp_student_federations_get",{studentId:foreignStudentId,fideOn:"2025-02-01"})).error?.code).toBe("NOT_FOUND");
 }finally{
  expect((await db.auth.admin.deleteUser(foreignId)).error).toBeNull();
 }
});

test("PARITY: FIDE effective-date review is keyboard usable in English, Hebrew and Russian",async({page,request})=>{
 test.setTimeout(90_000);
 const call=await delegatedTool(page,request);
 const original=await call("ccp_teacher_profile_get",{});
 expect(original.error).toBeUndefined();
 const initial=original.data.preferredLocale as "en"|"he"|"ru";
 const created=await call("ccp_students_create",{name:"FIDE language fixture "+randomUUID(),idempotencyKey:randomUUID()});
 expect(created.error).toBeUndefined();
 const studentId=created.data.entityId as string;
 const fideId="900000000148";
 const profile=await page.request.put(`/api/students/${studentId}`,{headers:{origin},data:{fideId}});
 expect(profile.status(),await profile.text()).toBe(200);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const teacher=await db.from("teachers").select("id").eq("email",SEED_TEACHER.email).single();
 expect(teacher.error).toBeNull();
 const seeded=await db.from("student_rating_snapshots").insert({
  teacher_id:teacher.data!.id,student_id:studentId,provider:"fide",time_control:"standard",
  rating:1837,external_player_id:fideId,provider_list_version:"fixture-2025-02",
  effective_at:"2025-02-01",observed_at:"2025-03-01T00:00:00Z",fetched_at:"2025-03-01T00:00:00Z",
  source:"provider_api",verification_state:"provider_published",source_url:"https://example.invalid/fide",
  source_digest:"b".repeat(64),request_id:randomUUID(),games:0,
 });
 expect(seeded.error).toBeNull();
 const update=async(preferredLocale:"en"|"he"|"ru")=>{
  const result=await page.request.put("/api/auth/update-profile",{data:{preferredLocale}});
  expect(result.status(),await result.text()).toBe(200);
 };
 const date="2025-02-07";
 const parity=await call("ccp_student_federations_get",{studentId,fideOn:date});
 expect(parity.error).toBeUndefined();
 expect(parity.data.fideEffectiveEvidence.fide).toMatchObject([
  {timeControl:"standard",status:"recorded",snapshot:{rating:1837}},
  {timeControl:"rapid",status:"not_recorded",snapshot:null},
  {timeControl:"blitz",status:"not_recorded",snapshot:null},
 ]);
 const locales=[
  {lang:"en",dir:"ltr",date:"FIDE effective date",open:"Review effective date",result:"FIDE effective-date result",
   through:"Requested through:",standard:"Standard",rapid:"Rapid",blitz:"Blitz",
   missing:"No verified rating evidence recorded",published:"Verified publication"},
  {lang:"he",dir:"rtl",date:"תאריך תחולה של פיד״ה",open:"סקירת תאריך התחולה",result:"תוצאות לפי תאריך התחולה של פיד״ה",
   through:"התאריך שנבחר:",standard:"קלאסי",rapid:"מהיר",blitz:"בזק",
   missing:"לא נשמרו ראיות דירוג מאומתות",published:"פרסום רשמי מאומת"},
  {lang:"ru",dir:"ltr",date:"Дата вступления рейтинга ФИДЕ в силу",open:"Проверить данные на дату",result:"Данные ФИДЕ на выбранную дату",
   through:"Выбранная дата:",standard:"Классика",rapid:"Рапид",blitz:"Блиц",
   missing:"Нет подтверждённых данных о рейтинге",published:"Официально подтверждено"},
 ] as const;
 await page.setViewportSize({width:390,height:844});
 try{
  for(const l of locales){
   await test.step(l.lang,async()=>{
    await update(l.lang);
    await page.goto(`/students/${studentId}`);
    await expect(page.locator("html")).toHaveAttribute("lang",l.lang);
    await expect(page.locator("html")).toHaveAttribute("dir",l.dir);
    const field=page.getByLabel(l.date,{exact:true});
    await field.fill(date);
    await expect(field).toHaveValue(date);
    const submit=page.getByRole("button",{name:l.open,exact:true});
    await submit.focus();
    await expect(submit).toBeFocused();
    const response=page.waitForResponse(r=>r.url().endsWith(`/api/students/${studentId}/federations?fideOn=${date}`));
    await page.keyboard.press("Enter");
    const signed=await response;
    expect(signed.status(),await signed.text()).toBe(200);
    expect((await signed.json()).fideEffectiveEvidence).toEqual(parity.data.fideEffectiveEvidence);
    const result=page.getByRole("region",{name:l.result,exact:true});
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("aria-live","polite");
    await expect(result).toHaveCSS("direction",l.dir);
    await expect(result).toContainText(l.through);
    await expect(result.locator(`time[datetime="${date}"] bdi`)).toHaveText(date);
    const categories=result.getByRole("listitem");
    await expect(categories).toHaveCount(3);
    await expect(categories.nth(0)).toContainText(`${l.standard}: 1837 · ${l.published}`);
    await expect(categories.nth(0).locator('time[datetime="2025-02-01"] bdi')).toHaveText("2025-02-01");
    await expect(categories.nth(0).getByText("fixture-2025-02",{exact:true})).toBeVisible();
    await expect(categories.nth(1)).toHaveText(`${l.rapid}: ${l.missing}`);
    await expect(categories.nth(2)).toHaveText(`${l.blitz}: ${l.missing}`);
    const width=await result.evaluate(element=>element.scrollWidth-element.clientWidth);
    expect(width,`${l.lang} date review horizontal overflow`).toBeLessThanOrEqual(2);
   });
  }
 }finally{await update(initial);}
});
