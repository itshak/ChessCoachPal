import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: Workplace management make-up notice field saves zero and inherits when cleared",async({page,request})=>{
 test.setTimeout(90000);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="makeup-notice-form-"+randomUUID()+"@example.invalid",password="SyntheticNoticeForm-11!";
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(created.error).toBeNull();
 const teacherId=created.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Synthetic cancellation form coach",onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const venues=await call("ccp_workplaces_list",{});
  expect(venues.error).toBeUndefined();
  const venue=venues.data[0].id as string;
  await page.goto("/coaching#manage-workplaces");
  const region=page.getByRole("region",{name:"Workplaces",exact:true});
  const form=region.locator("form").filter({
   has:page.getByRole("heading",{name:"Edit selected workplace",exact:true}),
  });
  const input=form.getByRole("spinbutton",{name:"Make-up cancellation notice (hours)"});
  await expect(input).toHaveValue("");
  await expect(input).toHaveAccessibleDescription(/Leave blank.*does not set charges/);
  const save=form.getByRole("button",{name:"Save workplace",exact:true});
  const observed=async()=>((await call("ccp_workplaces_list",{})).data as {id:string;cancellation_window_hours:number|null}[])
   .find(x=>x.id===venue)?.cancellation_window_hours;
  await input.fill("-1");
  await save.click();
  expect(await input.evaluate((el:HTMLInputElement)=>el.validity.rangeUnderflow)).toBe(true);
  expect(await observed()).toBeNull();
  await input.fill("0");
  await expect(input).toHaveValue("0");
  const submit=page.waitForResponse(r=>r.url().endsWith("/api/agent/v1")&&r.request().postData()?.includes('"action":"workplaces.update"')===true);
  await save.click();
  const submission=await submit;
  expect(submission.status(),await submission.text()).toBe(200);
  expect(submission.request().postDataJSON()).toMatchObject({workplaceId:venue,cancellationWindowHours:0});
  const sqlValue=await admin.from("workplaces").select("cancellation_window_hours").eq("id",venue).single();
  expect(sqlValue.error).toBeNull();
  expect(sqlValue.data?.cancellation_window_hours).toBe(0);
  await expect.poll(observed).toBe(0);
  await page.reload();
  await expect(input).toHaveValue("0");
  await input.fill("");
  await save.click();
  await expect.poll(observed).toBeNull();
  await page.reload();
  await expect(input).toHaveValue("");
 }finally{expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();}
});
