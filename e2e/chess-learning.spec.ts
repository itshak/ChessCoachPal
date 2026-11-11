import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { signInAsTeacher, SEED_TEACHER } from "./helpers/auth";

test("teacher website: observations and canonical typed material associations",async({page})=>{
 await signInAsTeacher(page);
 await page.goto("/learning");
 await expect(page.getByRole("heading",{name:"Chess learning"})).toBeVisible();
 const studentSelect=page.getByLabel("Chess learner");
 await expect.poll(async()=>studentSelect.inputValue()).not.toBe("");
 const studentId=await studentSelect.inputValue();
 const categoryId=(await (await page.request.post("/api/agent/v1",{
   data:{action:"chess.categories.list"},
 })).json()).data[0].id as string;
 await page.getByLabel("Chess skill area").selectOption(categoryId);
 const note="Teacher's material observation "+randomUUID().slice(0,8);
 await page.getByLabel("Chess observation").fill(note);
 await page.getByRole("button",{name:"Save verified observation"}).click();
 await expect(page.getByText(note)).toBeVisible();

 const payload={kind:"study_chapter" as const,title:"Opposition study "+randomUUID().slice(0,8),
   description:"",sourceUrl:"https://lichess.org/study/Ab12Cd34",
   details:{provider:"lichess",studyId:"Ab12Cd34",chapterId:null},
   requestId:randomUUID()};
 const created=await page.request.post("/api/training/materials",{data:payload});
 expect(created.status(),await created.text()).toBe(201);
 const materialId=(await created.json()).material.id as string;
 await page.getByRole("button",{name:"Refresh material catalog"}).click();
 await page.getByLabel("Learning material").selectOption(materialId);
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:"Attach learning material"}).click();
 await expect(page.getByRole("status")).toContainText("Material associated");
 const browser=await page.request.post("/api/agent/v1",{
   data:{action:"materials.links.list",studentId},
 });
 expect(browser.status(),await browser.text()).toBe(200);
 const links=(await browser.json()).data.links as Array<{id:string;material_id:string;revision:number}>;
 const link=links.find(l=>l.material_id===materialId);
 expect(link).toBeTruthy();

 // Correct the association to another canonical typed material. The underlying
 // material title, URL, and recorded teaching evidence are not copied or edited.
 const other=await page.request.post("/api/training/materials",{data:{
   ...payload,title:"Alternative endgame study "+randomUUID().slice(0,8),
   requestId:randomUUID(),
 }});
 expect(other.status(),await other.text()).toBe(201);
 const replacementId=(await other.json()).material.id as string;
 await page.getByRole("button",{name:"Refresh material catalog"}).click();
 await page.getByRole("button",{name:"Reassign material"}).first().click();
 await page.getByLabel("Replacement learning material").selectOption(replacementId);
 await page.getByRole("button",{name:"Save association"}).click();
 await expect(page.getByRole("status")).toContainText("association corrected");
 const revised=await page.request.post("/api/agent/v1",{
   data:{action:"materials.links.list",studentId},
 });
 expect((await revised.json()).data.links.some(
   (l:{id:string;material_id:string;revision:number})=>
    l.id===link!.id&&l.material_id===replacementId&&l.revision>link!.revision)).toBe(true);

 await page.reload();
 await expect(page.getByText(note)).toBeVisible();
 await expect(page.getByText(/Alternative endgame study/)).toBeVisible();
});

test("database: two teachers cannot read or attach chess records across ownership",async()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const a=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:teacherA,error:signInError}=await a.auth.signInWithPassword(SEED_TEACHER);
  expect(signInError).toBeNull();
  const aId=teacherA.user!.id;
  const suffix=randomUUID().slice(0,10);
  const email="chess-learning-"+suffix+"@example.com";
  const password="SyntheticPassword-123!";
  const {data:created,error:createError}=await admin.auth.admin.createUser({
    email,password,email_confirm:true,
  });
  expect(createError).toBeNull();
  const bId=created.user!.id;
  const {error:teacherError}=await admin.from("teachers").insert({
    id:bId,email,display_name:"Teacher B",
  });
  expect(teacherError).toBeNull();
  const b=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error:bAuthError}=await b.auth.signInWithPassword({email,password});
  expect(bAuthError).toBeNull();
  const {data:bSkill,error:bSkillError}=await b.from("chess_skill_categories")
    .select("id").eq("name","Endgames").single();
  expect(bSkillError).toBeNull();
  const {data:aSkill,error:aSkillError}=await a.from("chess_skill_categories")
    .select("id").eq("name","Endgames").single();
  expect(aSkillError).toBeNull();
  const {data:bStudent,error:bStudentError}=await b.from("students")
    .insert({teacher_id:bId,name:"Private chess student "+suffix})
    .select("id").single();
  expect(bStudentError).toBeNull();
  const {data:bObservation,error:bObsError}=await b.from("chess_observations").insert({
    teacher_id:bId,student_id:bStudent!.id,category_id:bSkill!.id,
    observation:"Private endgame notes",source:"teacher",
    verified_at:new Date().toISOString(),verified_by:bId,
  }).select("id").single();
  expect(bObsError).toBeNull();
  const {data:bMaterial,error:materialError}=await b.rpc("ccp_material_catalog_create",{
    p_kind:"external_link",p_title:"Private study",p_description:"",
    p_source_url:"https://example.org/private-study",p_details:{},p_request_id:randomUUID(),
  });
  expect(materialError).toBeNull();
  const {data:bLink,error:bLinkError}=await b.from("material_links").insert({
    teacher_id:bId,student_id:bStudent!.id,material_id:bMaterial!.id,
    request_id:randomUUID(),
  }).select("id").single();
  expect(bLinkError).toBeNull();
  const {data:foreignNotes}=await a.from("chess_observations").select("id").eq("id",bObservation!.id);
  const {data:foreignLinks}=await a.from("material_links").select("id").eq("id",bLink!.id);
  const {data:foreignCategories}=await a.from("chess_skill_categories").select("id").eq("id",bSkill!.id);
  expect(foreignNotes).toEqual([]);
  expect(foreignLinks).toEqual([]);
  expect(foreignCategories).toEqual([]);

  const {error:crossObs}=await a.from("chess_observations").insert({
    teacher_id:aId,student_id:bStudent!.id,category_id:aSkill!.id,
    observation:"Wrong owner",source:"teacher",verified_at:new Date().toISOString(),verified_by:aId,
  });
  expect(crossObs).toBeTruthy();
  const {error:crossLink}=await a.from("material_links").insert({
    teacher_id:aId,student_id:bStudent!.id,material_id:bMaterial!.id,
    request_id:randomUUID(),
  });
  expect(crossLink).toBeTruthy();
});
