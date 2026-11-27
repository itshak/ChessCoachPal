import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-daily-combined-close commits four explicit group decisions and one taught chapter together",async({page,request})=>{
  test.setTimeout(150_000);
  const localUrl=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(localUrl).hostname);
  const admin=createClient(localUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const ids:string[]=[];
  const password="DailyCombinedSynthetic456!";
  async function tenant(){
    const email="daily-combined-"+randomUUID()+"@example.invalid";
    const user=await admin.auth.admin.createUser({email,password,email_confirm:true});
    expect(user.error).toBeNull();
    const id=user.data.user!.id;
    ids.push(id);
    expect((await admin.from("teachers").insert({id,email,display_name:"Daily combined fixture",
      preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
    await configureSyntheticStudentCapacity(admin,id,6,3);
    return {id,email};
  }
  async function row(table:string,value:Record<string,unknown>){
    const result=await admin.from(table).insert(value).select("id").single();
    expect(result.error,table).toBeNull();
    return result.data!.id as string;
  }
  try{
    const owner=await tenant(),foreign=await tenant(),teacher_id=owner.id;
    const place=(name:string)=>row("workplaces",{teacher_id,name,timezone:"UTC",locale:"en",currency:"USD",
      kind:"professional",policy:{}});
    const workplaceId=await place("Combined workplace"),other=await place("Other workplace");
    const names=["Reviewed present learner","Reviewed absent learner","Reviewed late learner","Reviewed excused learner"];
    const students=await Promise.all(names.map(name=>row("students",{teacher_id,name})));
    const day=new Date(Date.now()-86400_000).toISOString().slice(0,10);
    const enrolled=new Date(Date.now()-7*86400_000).toISOString().slice(0,10);
    expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:"UTC"})).error).toBeNull();
    expect((await admin.from("workplace_enrollments").insert(students.map(student_id=>({
      teacher_id,workplace_id:workplaceId,student_id,starts_on:enrolled,source:"manual",
    })))).error).toBeNull();
    const tool=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
    expect((await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:workplaceId,expectedSelectedWorkplaceId:null,confirmed:true,
    })).error).toBeUndefined();
    const create=await tool("ccp_sessions_ad_hoc_create",{workplaceId,studentIds:students,
      title:"Exact combined lesson",startsAt:day+"T08:00:00Z",durationMinutes:30,lessonNote:"Original lesson note",
      idempotencyKey:randomUUID(),confirmed:true,
    });
    expect(create.error).toBeUndefined();
    const sessionId=create.data.id as string;
    const origMaterial={kind:"external_link",title:"Exact taught chapter",sourceUrl:"https://example.invalid/chapter",details:{}};
    const make=await tool("ccp_learning_materials_create",{...origMaterial,requestId:randomUUID()});
    expect(make.error).toBeUndefined();
    const materialId=make.data.material.id as string;
    const outside=await row("learning_materials",{teacher_id:foreign.id,
      kind:"external_link",title:"Other owner's catalog",source_url:"https://example.invalid/foreign",
      request_id:randomUUID(),request_hash:"synthetic-foreign"});
    const roster=await tool("ccp_sessions_roster_preview",{sessionId,dailyWorkplaceId:workplaceId});
    expect(roster.error).toBeUndefined();
    const ready={sessionId,dailyWorkplaceId:workplaceId,expectedUpdatedAt:roster.data.updatedAt,
      materialId,lessonNote:"Verified combined note",taughtStudentIds:[students[0],students[2]],
      attendance:[
        {studentId:students[0],status:"present",note:"Present learner note",expectedUpdatedAt:null},
        {studentId:students[1],status:"absent",note:"Absent learner note",expectedUpdatedAt:null},
        {studentId:students[2],status:"late",note:"Late learner note",expectedUpdatedAt:null},
        {studentId:students[3],status:"excused",note:"Excused learner note",expectedUpdatedAt:null},
      ],
    };
    async function snapshot(){
      const all=await Promise.all([
        admin.from("teaching_sessions").select("id,status,lesson_note,updated_at").eq("id",sessionId).single(),
        admin.from("session_attendance").select("student_id,status,note").eq("session_id",sessionId).order("student_id"),
        admin.from("material_links").select("material_id,session_id,student_id").eq("session_id",sessionId),
        admin.from("material_teaching_evidence").select("material_id,student_id,stage,occurred_on")
          .eq("session_id",sessionId).order("student_id"),
      ]);
      expect(all.map(x=>x.error)).toEqual([null,null,null,null]);
      return all.map(x=>x.data);
    }
    const original=await snapshot();
    const api="/api/coaching/lesson-completion";
    const previewTool="ccp_daily_lesson_complete_with_material_preview";
    const commitTool="ccp_daily_lesson_complete_with_material_commit";
    const remote=await tool(previewTool,ready);
    expect(remote.error).toBeUndefined();
    const http=await page.request.post(api,{data:{action:"preview",...ready}});
    expect(http.status(),await http.text()).toBe(200);
    expect(await http.json()).toEqual(remote.data);
    expect(remote.data.proposed).toMatchObject({materialId,materialRevision:"1",occurredOn:day,taughtStudentIds:[...ready.taughtStudentIds].sort()});
    expect(remote.data).toMatchObject({requiresConfirmation:true,inferredMastery:false});
    expect((await tool(previewTool,{...ready,materialId:outside})).error?.code).toBe("NOT_FOUND");
    expect((await tool(previewTool,{...ready,taughtStudentIds:[students[1]]})).error?.code).toBe("VALIDATION_ERROR");
    expect((await tool(previewTool,{...ready,taughtStudentIds:[students[3]]})).error?.code).toBe("VALIDATION_ERROR");
    expect((await tool(previewTool,{...ready,attendance:ready.attendance.slice(0,3)})).error?.code)
      .toBe("DAILY_LESSON_ROSTER_MISMATCH");
    expect((await tool(previewTool,{...ready,dailyWorkplaceId:other})).error?.code).toBe("STALE_WORKPLACE_CONTEXT");
    expect((await page.request.post(api,{data:{
      action:"commit",...remote.data.proposed,requestId:randomUUID(),confirmed:false,
    }})).status()).toBe(400);
    const revised=await tool("ccp_learning_materials_update",{...origMaterial,title:"Exact revised taught chapter",
      materialId,expectedRevision:1,confirmed:true,requestId:randomUUID()});
    expect(revised.error).toBeUndefined();
    expect((await tool(commitTool,{...remote.data.proposed,confirmed:true,requestId:randomUUID()})).error?.code)
      .toBe("STALE_DAILY_MATERIAL_REVISION");
    expect(await snapshot()).toEqual(original);

    await page.goto("/dashboard?date="+day);
    await page.locator('a[href^="/coaching?recordSession='+sessionId+'&"]').click();
    const panel=page.getByRole("region",{name:"Complete coaching lesson"});
    for(const [i,decision] of ready.attendance.entries())
      await panel.getByRole("combobox",{name:"Attendance for "+names[i]}).selectOption(decision.status);
    for(const row of ready.attendance)
      await panel.locator('[data-roster-student-id="'+row.studentId+'"]').getByRole("textbox").fill(row.note);
    await panel.getByRole("textbox",{name:/Shared coaching lesson note/}).fill(ready.lessonNote);
    await panel.getByRole("checkbox",{name:"Record taught material together with this lesson"}).check();
    await panel.getByRole("textbox",{name:"Search active materials by title"}).fill("Exact revised taught chapter");
    await panel.getByRole("button",{name:"Find materials"}).click();
    await panel.getByRole("combobox",{name:"Existing material"}).selectOption(materialId);
    await expect(panel.getByRole("checkbox",{name:names[1]})).toBeDisabled();
    await expect(panel.getByRole("checkbox",{name:names[3]})).toBeDisabled();
    await panel.getByRole("checkbox",{name:names[0]}).check();
    await panel.getByRole("checkbox",{name:names[2]}).check();
    const save=panel.getByRole("button",{name:"Complete lesson and save taught material"});
    await expect(save).toBeDisabled();
    await panel.getByRole("button",{name:"Review lesson and taught material"}).click();
    await expect(panel.getByRole("status").filter({hasText:"Exact revised taught chapter"})).toBeVisible();
    expect(await snapshot()).toEqual(original);
    await panel.getByRole("checkbox",{name:"I approve these exact attendance decisions, notes and selected taught material."}).check();

    const observed:Record<string,unknown>[]=[];
    await page.route("**"+api,async route=>{
      const payload=route.request().postDataJSON() as Record<string,unknown>;
      if(payload.action!=="commit"){await route.continue();return;}
      observed.push(payload);
      if(observed.length!==1){await route.continue();return;}
      const committed=await route.fetch();
      expect(committed.status(),await committed.text()).toBe(200);
      await route.abort("failed");
    });
    await save.click();
    await expect(panel.getByRole("alert")).toContainText("Retry this same approved request");
    await save.click();
    await expect(panel.getByRole("status")).toContainText("Lesson and taught material recorded together");
    expect(observed).toHaveLength(2);
    expect(observed[1]).toEqual(observed[0]);
    const {action,...approved}=observed[0];
    expect(action).toBe("commit");
    const replay=await tool(commitTool,approved);
    expect(replay.error).toBeUndefined();
    expect(replay.data).toMatchObject({sessionId,materialId,materialRevision:"2",oneTransaction:true,attendanceCount:4,replayed:true,inferredMastery:false});
    const [lesson,attendance,links,evidence]=await snapshot();
    expect(lesson).toMatchObject({id:sessionId,status:"completed",lesson_note:ready.lessonNote});
    expect(attendance).toEqual(ready.attendance.map(({studentId,status,note})=>({student_id:studentId,status,note}))
      .sort((a,b)=>a.student_id.localeCompare(b.student_id)));
    expect(links).toEqual([{material_id:materialId,session_id:sessionId,student_id:null}]);
    expect(evidence).toEqual([...ready.taughtStudentIds].sort().map(student_id=>({
      material_id:materialId,student_id,stage:"taught",occurred_on:day,
    })));
  }finally{
    // This workflow intentionally creates linked audit/receipt evidence.
    // Retire only the synthetic Auth identities; preserve the fixture history
    // until the enclosing disposable database is removed.
    for(const id of ids)expect((await admin.auth.admin.deleteUser(id,true)).error).toBeNull();
  }
});
