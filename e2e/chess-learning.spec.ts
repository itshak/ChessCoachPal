import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { signInAsTeacher, SEED_TEACHER } from "./helpers/auth";

test("teacher website: verified chess observation, editable history, curated study, and explicit approval", async ({page})=>{
  await signInAsTeacher(page);
  await page.goto("/learning");
  await expect(page.getByRole("heading",{name:"Chess learning"})).toBeVisible();
  await expect(page.getByLabel("Chess skill area")).toContainText("Endgames");
  const suffix=Date.now().toString(36);
  const first="Opposition observation "+suffix;
  const edited="Corrected opposition observation "+suffix;
  const suggested="Agent suggestion "+suffix;
  const linkName="Study opposition "+suffix;
  const person=page.getByLabel("Chess learner");
  await expect.poll(async()=>await person.inputValue()).not.toBe("");
  const studentId=await person.inputValue();
  const categories=await page.request.post("/api/agent/v1",{data:{action:"chess.categories.list"}});
  expect(categories.status()).toBe(200);
  const categoryId=(await categories.json()).data.find((c:{name:string})=>c.name==="Endgames").id as string;
  await page.getByLabel("Chess skill area").selectOption(categoryId);
  await page.getByLabel("Chess observation").fill(first);
  await page.getByRole("button",{name:"Save verified observation"}).click();
  await expect(page.getByRole("status")).toContainText("Verified teacher observation");
  await expect(page.getByText(first)).toBeVisible();

  const suggest=await page.request.post("/api/agent/v1",{data:{
    action:"chess.observations.propose",studentId,categoryId,observation:suggested,requestId:randomUUID(),
  }});
  expect(suggest.status(),await suggest.text()).toBe(200);
  const proposal=(await suggest.json()).data;
  expect(proposal.source).toBe("agent");
  expect(proposal.verified_at).toBeNull();

  await page.reload();
  await expect(page.getByText(first)).toBeVisible();
  await expect(page.getByText(suggested)).toBeVisible();
  const suggestionRow=page.getByText(suggested).locator("..");
  await expect(suggestionRow).toContainText("Unverified suggestion");
  await suggestionRow.getByRole("button",{name:"Approve suggestion"}).click();
  await expect(page.getByRole("status")).toContainText("explicitly approved");
  await expect(page.getByText(suggested).locator("..")).toContainText("Verified");

  const teacherRow=page.getByText(first).locator("..");
  await teacherRow.getByRole("button",{name:"Edit observation"}).click();
  await teacherRow.getByLabel("Edit chess observation").fill(edited);
  await teacherRow.getByRole("button",{name:"Save correction"}).click();
  await expect(page.getByText(edited)).toBeVisible();

  await page.getByLabel("Resource label").fill(linkName);
  await page.getByLabel("HTTPS learning URL").fill("https://lichess.org/study/Ab12Cd34");
  await page.getByRole("button",{name:"Save learning link"}).click();
  await expect(page.getByRole("status")).toContainText("Learning resource saved");
  const link=page.getByRole("link",{name:linkName});
  await expect(link).toHaveAttribute("href","https://lichess.org/study/Ab12Cd34");
  const linkRow=link.locator("..");
  await linkRow.getByRole("button",{name:"Edit link"}).click();
  await linkRow.getByLabel("Edit resource label").fill(linkName+" corrected");
  await linkRow.getByRole("button",{name:"Save link correction"}).click();
  await expect(page.getByRole("link",{name:linkName+" corrected"})).toBeVisible();

  await page.reload();
  await expect(page.getByText(edited)).toBeVisible();
  await expect(page.getByRole("link",{name:linkName+" corrected"})).toBeVisible();
  await expect(page.getByText(suggested).locator("..")).toContainText("Verified");
  // Provider availability never blocks locally stored observations or links.
  await page.getByLabel("Link type").selectOption("external");
  await page.getByLabel("Resource label").fill("Unavailable study "+suffix);
  await page.getByLabel("HTTPS learning URL").fill("https://study.example.invalid/chess");
  await page.getByRole("button",{name:"Save learning link"}).click();
  await expect(page.getByRole("status")).toContainText("Learning resource saved");
  await page.reload();
  await expect(page.getByRole("link",{name:"Unavailable study "+suffix})).toBeVisible();
  await expect(page.getByText(edited)).toBeVisible();
  await page.getByLabel("Link type").selectOption("lichess_study");
  await page.getByLabel("Resource label").fill("Unsafe resource");
  await page.getByLabel("HTTPS learning URL").fill("https://lichess.org.evil.example/study/Ab12Cd34");
  await page.getByRole("button",{name:"Save learning link"}).click();
  await expect(page.getByRole("alert")).toContainText("direct lichess.org/study link");
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
  const {data:bLink,error:bLinkError}=await b.from("chess_learning_resources").insert({
    teacher_id:bId,student_id:bStudent!.id,label:"Private study",
    url:"https://lichess.org/study/Ab12Cd34",resource_type:"lichess_study",
    provider_study_id:"Ab12Cd34",
  }).select("id").single();
  expect(bLinkError).toBeNull();
  const {data:foreignNotes}=await a.from("chess_observations").select("id").eq("id",bObservation!.id);
  const {data:foreignLinks}=await a.from("chess_learning_resources").select("id").eq("id",bLink!.id);
  const {data:foreignCategories}=await a.from("chess_skill_categories").select("id").eq("id",bSkill!.id);
  expect(foreignNotes).toEqual([]);
  expect(foreignLinks).toEqual([]);
  expect(foreignCategories).toEqual([]);

  const {error:crossObs}=await a.from("chess_observations").insert({
    teacher_id:aId,student_id:bStudent!.id,category_id:aSkill!.id,
    observation:"Wrong owner",source:"teacher",verified_at:new Date().toISOString(),verified_by:aId,
  });
  expect(crossObs).toBeTruthy();
  const {error:crossLink}=await a.from("chess_learning_resources").insert({
    teacher_id:aId,student_id:bStudent!.id,label:"Wrong owner",
    url:"https://example.org/study",resource_type:"external",
  });
  expect(crossLink).toBeTruthy();
});
