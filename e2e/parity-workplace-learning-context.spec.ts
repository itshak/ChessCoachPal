import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY: Learning keeps the active workplace through reload and Coaching, with scoped picks and global materials",async({page,request})=>{
 test.setTimeout(90000);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="coaching-context-"+randomUUID()+"@example.com",password="SyntheticCoachingContext-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Synthetic Learning context",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacherId,5,3);
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const other=await call("ccp_workplaces_create",{name:"Synthetic Coaching School "+randomUUID(),timezone:"Asia/Jerusalem",currency:"ILS",
   locale:"en",policy:{},idempotencyKey:randomUUID()});
  expect(other.error).toBeUndefined();
  const school=other.data.entityId as string;
  const personal=await admin.from("workplaces").select("id").eq("teacher_id",teacherId).eq("kind","personal").single();
  expect(personal.error).toBeNull();
  const privateId=personal.data!.id;
  async function learner(name:string){
   const s=await call("ccp_students_create",{name,idempotencyKey:randomUUID()});
   expect(s.error).toBeUndefined();
   return s.data.entityId as string;
  }
  const name="Synthetic dual learner "+randomUUID();
  const privateName="Synthetic private only learner "+randomUUID();
  const studentId=await learner(name),privateStudentId=await learner(privateName);
  for(const [workplaceId,id] of [[school,studentId],[privateId,studentId],[privateId,privateStudentId]]){
   expect((await call("ccp_workplaces_enroll",{workplaceId,studentId:id,idempotencyKey:randomUUID()})).error).toBeUndefined();
  }
  const schoolLesson=randomUUID(),privateLesson=randomUUID();
  const rows=[
   {id:schoolLesson,workplace_id:school,title:"Synthetic School lesson",starts_at:"2063-02-02T12:00:00Z"},
   {id:privateLesson,workplace_id:privateId,title:"Synthetic private lesson",starts_at:"2063-02-03T12:00:00Z"},
  ];
  expect((await admin.from("teaching_sessions").insert(rows.map(row=>({...row,teacher_id:teacherId,student_id:studentId,
   duration_minutes:45,local_timezone:"UTC"})))).error).toBeNull();
  expect((await call("ccp_workplace_context_set",{selectedWorkplaceId:school,expectedSelectedWorkplaceId:null,confirmed:true})).error).toBeUndefined();
  const material=await call("ccp_learning_materials_create",{
   kind:"external_link",title:"Teacher-wide study resource",description:"",sourceUrl:"https://example.invalid/study",details:{},
   requestId:randomUUID(),
  });
  expect(material.error).toBeUndefined();
  const materialId=material.data.material.id as string;
  const assignment=await call("ccp_training_assignments_create",{
   studentIds:[studentId],materialId,instructions:"Global assignment for the dual learner",
   dueOn:null,requestId:randomUUID(),confirmed:true,
  });
  expect(assignment.error).toBeUndefined();
  await page.goto("/learning");
  const history=page.getByRole("region",{name:"Material learning history"});
  const historyVenue=history.getByLabel("Workplace (optional)");
  const related=page.getByRole("combobox",{name:"Related coaching lesson"});
  const homework=page.getByRole("region",{name:"Student chess homework"});
  const studentPicker=homework.getByRole("combobox").nth(0);
  const materialPicker=homework.getByRole("combobox").nth(1);
  const option=(picker:typeof related,value:string)=>picker.locator('option[value="'+value+'"]');
  const expectSchool=async()=>{
   await expect(page.locator("#global-workplace-switch")).toHaveValue(school);
   await expect(historyVenue).toHaveValue(school);
   await expect(option(related,schoolLesson)).toHaveCount(1);
   await expect(option(related,privateLesson)).toHaveCount(0);
   await expect(option(studentPicker,studentId)).toHaveCount(1);
   await expect(option(studentPicker,privateStudentId)).toHaveCount(0);
   await expect(option(materialPicker,materialId)).toHaveCount(1);
   await expect(homework.getByText("Global assignment for the dual learner",{exact:true})).toBeVisible();
  };
  await expectSchool();
  await page.reload();
  await expectSchool();
  const scopedSite=await page.request.get("/api/students?limit=100&workplaceId="+school);
  expect(scopedSite.status(),await scopedSite.text()).toBe(200);
  const scopedMcp=await call("ccp_students_roster",{workplaceId:school,limit:100});
  expect(scopedMcp.error).toBeUndefined();
  const siteRoster=await scopedSite.json();
  const learnerIdentity=(rows:Array<{id:string;name:string}>)=>rows.map(({id,name})=>({id,name}));
  expect(learnerIdentity(siteRoster.students)).toEqual(learnerIdentity(scopedMcp.data.students));
  expect(siteRoster.nextOffset).toBe(scopedMcp.data.nextOffset);
  expect(scopedMcp.data.students.map((row:{id:string})=>row.id)).toEqual([studentId]);
  const globalMcp=await call("ccp_students_roster",{workplaceId:null,limit:100});
  expect(globalMcp.error).toBeUndefined();
  expect(globalMcp.data.students.map((row:{id:string})=>row.id).sort()).toEqual([studentId,privateStudentId].sort());
  const coaching=page.getByRole("link",{name:"Lessons",exact:true}).first();
  await coaching.click();
  await expect(page).toHaveURL(/\/coaching$/);
  await expect(historyVenue).toHaveValue(school);
  await expect(option(related,schoolLesson)).toHaveCount(1);
  await expect(option(related,privateLesson)).toHaveCount(0);
  await page.getByRole("link",{name:"Training & Materials",exact:true}).first().click();
  await expect(page).toHaveURL(/\/learning$/);
  await expectSchool();
  await page.locator("#global-workplace-switch").selectOption(privateId);
  await expect(historyVenue).toHaveValue(privateId);
  await expect(option(related,privateLesson)).toHaveCount(1);
  await expect(option(related,schoolLesson)).toHaveCount(0);
  await expect(option(studentPicker,studentId)).toHaveCount(1);
  await expect(option(studentPicker,privateStudentId)).toHaveCount(1);
  await expect(option(materialPicker,materialId)).toHaveCount(1);
  await page.locator("#global-workplace-switch").selectOption("all");
  await expect(historyVenue).toHaveValue("");
  await expect(option(related,schoolLesson)).toHaveCount(1);
  await expect(option(related,privateLesson)).toHaveCount(1);
  await expect(option(studentPicker,privateStudentId)).toHaveCount(1);
  await expect(option(materialPicker,materialId)).toHaveCount(1);
  const actual=await admin.from("training_assignments").select("id",{count:"exact",head:true}).eq("teacher_id",teacherId);
  expect(actual.error).toBeNull();
  expect(actual.count).toBe(1);
  const afterAssignments=await call("ccp_training_assignments_list",{studentId});
  expect(afterAssignments.error).toBeUndefined();
  expect(afterAssignments.data.assignments.map((row:{id:string})=>row.id)).toEqual(assignment.data.assignmentIds);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
