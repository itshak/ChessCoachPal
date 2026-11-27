import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest} from "./helpers/isolated-teacher";

isolatedTeacherTest("PARITY: saved coach language wins on a clean device and read-only clients cannot change it",async({
 page,request,browser,isolatedTeacher,
})=>{
 const baseURL=process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000";
 const owner=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const before=await owner("ccp_teacher_profile_get",{});
 expect(before.error).toBeUndefined();
 expect(before.data.preferredLocale).toBe("en");
 const created=await owner("ccp_workplaces_create",{
  name:"Locale independence "+randomUUID(),timezone:"Asia/Tokyo",currency:"JPY",
  locale:"ru",policy:{},idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const workplaceId=created.data.entityId as string;
 const original=await owner("ccp_workplaces_list",{});
 expect(original.error).toBeUndefined();
 const workplace=(original.data as Array<{id:string}>).find(x=>x.id===workplaceId);
 expect(workplace).toMatchObject({timezone:"Asia/Tokyo",currency:"JPY",locale:"ru"});
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const second={email:"locale-second-"+randomUUID()+"@example.invalid",password:"SyntheticLocale-123!"};
 const createdOther=await admin.auth.admin.createUser({...second,email_confirm:true});
 expect(createdOther.error).toBeNull();
 const otherId=createdOther.data.user!.id;
 const clean=await browser.newContext({baseURL,locale:"en-US"});
 const otherContext=await browser.newContext({baseURL,locale:"en-US"});
 try{
  expect((await admin.from("teachers").insert({
   id:otherId,email:second.email,display_name:"Second synthetic coach",preferred_locale:"ru",
   onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  const otherPage=await otherContext.newPage();
  const other=await delegatedTool(otherPage,request,"coach:read",second,"Разрешить");
  const otherBefore=await other("ccp_teacher_profile_get",{});
  expect(otherBefore.error).toBeUndefined();
  expect(otherBefore.data.preferredLocale).toBe("ru");

  const saved=await page.request.put("/api/auth/update-profile",{data:{preferredLocale:"he"}});
  expect(saved.status(),await saved.text()).toBe(200);
  expect((await owner("ccp_teacher_profile_get",{})).data.preferredLocale).toBe("he");

  // A fresh browser preference must affect only the unauthenticated page.
  const signedOut=await clean.newPage();
  expect((await clean.request.post("/api/preferences/locale",{data:{locale:"ru"}})).status()).toBe(200);
  const login=await signedOut.goto("/login");
  expect(login?.status()).toBe(200);
  expect(await login!.text()).toMatch(/<html[^>]*\blang="ru"[^>]*\bdir="ltr"/);
  await expect(signedOut.locator("html")).toHaveAttribute("lang","ru");
  const readOnly=await delegatedTool(signedOut,request,"coach:read",isolatedTeacher,"אישור גישה");
  const account=await signedOut.goto("/account");
  expect(account?.status()).toBe(200);
  expect(await account!.text()).toMatch(/<html[^>]*\blang="he"[^>]*\bdir="rtl"/);
  await expect(signedOut.locator("html")).toHaveAttribute("lang","he");
  await expect(signedOut.locator("#account-language")).toHaveValue("he");
  const delegated=await readOnly("ccp_teacher_profile_get",{});
  expect(delegated.error).toBeUndefined();
  expect(delegated.data.preferredLocale).toBe("he");
  expect(delegated.data).not.toHaveProperty("email");
  expect(JSON.stringify(delegated.data)).not.toContain(isolatedTeacher.email);
  expect((await readOnly.listTools()).some(x=>x.name==="ccp_teacher_profile_update")).toBe(false);
  expect((await readOnly("ccp_teacher_profile_update",{preferredLocale:"ru",confirmed:true})).error?.code)
   .toBe("FORBIDDEN");
  expect((await owner("ccp_teacher_profile_get",{})).data.preferredLocale).toBe("he");
  expect((await other("ccp_teacher_profile_get",{})).data).toEqual(otherBefore.data);
  const foreignVenue=await other("ccp_workplaces_list",{});
  expect(foreignVenue.error).toBeUndefined();
  expect(foreignVenue.data).not.toEqual(expect.arrayContaining([expect.objectContaining({id:workplaceId})]));
  await otherPage.goto("/account");
  await expect(otherPage.locator("html")).toHaveAttribute("lang","ru");
  const reread=await readOnly("ccp_workplaces_list",{});
  expect(reread.error).toBeUndefined();
  expect((reread.data as Array<{id:string}>).find(x=>x.id===workplaceId)).toEqual(workplace);
 } finally {
  // Leave browser-owned pages to the runner's teardown. Closing both
  // contexts concurrently while it captures videos can hang Chromium.
  expect((await admin.auth.admin.deleteUser(otherId)).error).toBeNull();
 }
});

isolatedTeacherTest("saved coach language and guest language stay separate across two tabs and sign-out",async({
 page,context,isolatedTeacher,
})=>{
 const signIn=async()=>{
  await page.locator('form input[type="email"]').fill(isolatedTeacher.email);
  await page.locator('form input[type="password"]').fill(isolatedTeacher.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL("**/dashboard");
 };
 await page.goto("/login");
 await signIn();
 const save=await page.request.put("/api/auth/update-profile",{data:{preferredLocale:"he"}});
 expect(save.status(),await save.text()).toBe(200);

 // Set a different browser preference without updating the authenticated profile.
 expect((await context.request.post("/api/preferences/locale",{data:{locale:"ru"}})).status()).toBe(200);
 await page.goto("/account");
 await expect(page).toHaveTitle(/הגדרות חשבון/);
 await expect(page.locator("html")).toHaveAttribute("lang","he");
 await expect(page.locator("html")).toHaveAttribute("dir","rtl");

 const second=await context.newPage();
 await second.goto("/account");
 await expect(second.locator("html")).toHaveAttribute("lang","he");
 await expect(second.locator("#account-language")).toHaveValue("he");
 await page.getByRole("button",{name:"תפריט חשבון",exact:true}).click();
 await page.getByRole("menuitem",{name:"התנתקות",exact:true}).click();
 await page.waitForURL("**/login");
 await expect(page).toHaveTitle(/Вход/);
 await expect(page.locator("html")).toHaveAttribute("lang","ru");
 await expect(page.locator("html")).toHaveAttribute("dir","ltr");

 const signedOut=await second.reload();
 expect(signedOut?.status()).toBe(200);
 await expect(second).toHaveURL(/\/login$/);
 expect(await signedOut!.text()).toMatch(/<html[^>]*\blang="ru"[^>]*\bdir="ltr"/);
 expect((await second.request.get("/api/teacher/context")).status()).toBe(401);
 await expect(second.locator("#account-language")).toHaveCount(0);

 await signIn();
 const signedIn=await second.goto("/account");
 expect(signedIn?.status()).toBe(200);
 expect(await signedIn!.text()).toMatch(/<html[^>]*\blang="he"[^>]*\bdir="rtl"/);
 await expect(second.locator("#account-language")).toHaveValue("he");
});
