import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";

test("fresh database retained owner opens the dashboard with default workspace and no copied app data",async({page})=>{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const email="owner-reset-"+randomUUID()+"@example.invalid";
  const password="SyntheticOwnerReset-123!";
  const displayName="Synthetic retained owner";
  const {data:identity,error:identityError}=await db.auth.admin.createUser({email,password,email_confirm:true});
  expect(identityError).toBeNull();
  const ownerId=identity.user!.id;
  try{
    const before=await db.from("teachers").select("id").eq("id",ownerId).maybeSingle();
    expect(before.error).toBeNull();
    expect(before.data).toBeNull();
    // The authorized one-account import must include provisioning the minimal
    // teacher profile before traffic starts, not just Auth and its identity.
    // This fixture grants no new role; canonical triggers provision defaults.
    const profile=await db.from("teachers").insert({id:ownerId,email,display_name:displayName});
    expect(profile.error).toBeNull();
    const settings=await db.from("teacher_settings").upsert({teacher_id:ownerId},{onConflict:"teacher_id",ignoreDuplicates:true});
    expect(settings.error).toBeNull();

    await page.goto("/login");
    await page.locator('form input[type="email"]').fill(email);
    await page.locator('form input[type="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL("**/dashboard",{timeout:20000});
    await expect(page.getByRole("heading",{level:1})).toContainText(displayName);
    const context=await page.request.get("/api/teacher/context");
    expect(context.status()).toBe(200);
    expect(await context.json()).toMatchObject({
      selectedWorkplaceId:null,
      workplaces:[{name:"Private coaching",timezone:"UTC",locale:"en",currency:"USD"}],
    });
    const empty=await db.from("students").select("id",{count:"exact",head:true}).eq("teacher_id",ownerId);
    expect(empty.error).toBeNull();
    expect(empty.count).toBe(0);
  }finally{
    expect((await db.auth.admin.deleteUser(ownerId)).error).toBeNull();
  }
});
