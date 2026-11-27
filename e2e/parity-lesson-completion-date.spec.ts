import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest} from "./helpers/isolated-teacher";

isolatedTeacherTest.use({timezoneId:"Pacific/Honolulu"});

isolatedTeacherTest("PARITY: lesson completion dates use the frozen or owned workplace timezone",async({
 page,request,isolatedTeacher,
})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 expect((await call("ccp_teacher_profile_update",{preferredLocale:"ru",confirmed:true})).error).toBeUndefined();
 const workspace=await call("ccp_workplaces_create",{
  name:"Synthetic date "+randomUUID(),timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",
  policy:{},idempotencyKey:randomUUID(),
 });
 expect(workspace.error).toBeUndefined();
 const workplaceId=workspace.data.entityId as string;
 const learner=await call("ccp_students_create",{name:"תלמיד "+randomUUID(),idempotencyKey:randomUUID()});
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 expect((await call("ccp_workplaces_enroll",{workplaceId,studentId,idempotencyKey:randomUUID()})).error).toBeUndefined();

 const ordinary={title:"Дата в рабочем часовом поясе",startsAt:"2049-01-10T22:10:00.000Z",
  timeZone:"Asia/Jerusalem",date:"11.01.2049"};
 const created=await call("ccp_sessions_create",{
  workplaceId,studentId,title:ordinary.title,startsAt:ordinary.startsAt,
  durationMinutes:45,idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const ordinaryId=created.data.entityId as string;

 // A historical lesson may have a frozen local zone that differs from the
 // venue today. Seed that canonical shape without updating the schema.
 const frozen={id:randomUUID(),title:"Дата в исходном часовом поясе",startsAt:"2049-01-12T16:10:00.000Z",
  timeZone:"Asia/Tokyo",date:"13.01.2049"};
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const owner=await admin.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
 expect(owner.error).toBeNull();
 expect((await admin.from("teaching_sessions").insert({
  id:frozen.id,teacher_id:owner.data!.id,workplace_id:workplaceId,student_id:studentId,
  title:frozen.title,starts_at:frozen.startsAt,duration_minutes:45,local_timezone:frozen.timeZone,
 })).error).toBeNull();

 const read=await page.request.post("/api/agent/v1",{data:{action:"sessions.list",workplaceId}});
 expect(read.status(),await read.text()).toBe(200);
 const site=(await read.json()).data;
 const mcp=await call("ccp_sessions_list",{workplaceId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toHaveLength(2);
 const {data:source,error:sourceError}=await admin.from("teaching_sessions").select("id,local_timezone").in("id",[ordinaryId,frozen.id]);
 expect(sourceError).toBeNull();
 expect(source).toEqual(expect.arrayContaining([
  {id:ordinaryId,local_timezone:null},{id:frozen.id,local_timezone:frozen.timeZone},
 ]));
 await page.goto("/coaching");
 await expect(page.locator("html")).toHaveAttribute("lang","ru");
 expect(await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("Pacific/Honolulu");
 const chooser=page.getByRole("combobox",{name:"Занятие для завершения",exact:true});
 for(const wanted of [{id:ordinaryId,...ordinary},frozen]){
  const row=site.find((x:{id:string})=>x.id===wanted.id);
  const {revision,...delegated}=mcp.data.find((x:{id:string})=>x.id===wanted.id);
  expect(revision).toBeTruthy();
  expect(delegated).toEqual(row);
  expect(row.sessionTimeZone).toBe(wanted.timeZone);
  expect(new Date(row.starts_at).toISOString()).toBe(wanted.startsAt);
  await expect(chooser.locator('option[value="'+wanted.id+'"]'))
   .toHaveText(wanted.title+" · "+wanted.date+" · Запланировано");
 }
});
