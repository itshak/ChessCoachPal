import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-daily-lesson-close",async({page,request})=>{
  test.setTimeout(120_000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const auth={persistSession:false,autoRefreshToken:false};
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth});
  const identities:string[]=[];
  const password="SyntheticDailyExactClose456!";
  async function tenant(){
    const email="daily-attendance-"+randomUUID()+"@example.invalid";
    const result=await admin.auth.admin.createUser({email,password,email_confirm:true});
    expect(result.error).toBeNull();
    const id=result.data.user!.id;
    identities.push(id);
    expect((await admin.from("teachers").insert({id,email,display_name:"Attendance fixture",
      preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
    return {id,email};
  }
  async function insert(table:string,value:Record<string,unknown>){
    const result=await admin.from(table).insert(value).select("id").single();
    expect(result.error,table).toBeNull();
    return result.data!.id as string;
  }
  try{
    const owner=await tenant(), foreign=await tenant(), teacher_id=owner.id;
    await configureSyntheticStudentCapacity(admin,teacher_id,8,4);
    const place=(teacher_id:string,name:string)=>insert("workplaces",{
      teacher_id,name,timezone:"UTC",currency:"USD",locale:"en",kind:"professional",policy:{},
    });
    const first=await place(teacher_id,"Attendance School"), second=await place(teacher_id,"Attendance Other");
    const external=await place(foreign.id,"Attendance Foreign");
    expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:"UTC"})).error).toBeNull();
    const names=["Frozen attendance first","Frozen attendance second"];
    const students=await Promise.all(names.map(name=>insert("students",{teacher_id,name})));
    const yesterday=new Date(Date.now()-86400_000).toISOString().slice(0,10);
    const old=new Date(Date.now()-7*86400_000).toISOString();
    const group=await insert("class_groups",{teacher_id,workplace_id:first,name:"Mixed evidence group"});
    const emptyGroup=await insert("class_groups",{teacher_id,workplace_id:first,name:"No frozen roster group"});
    const foreignGroup=await insert("class_groups",{teacher_id:foreign.id,workplace_id:external,name:"Foreign group"});
    const secondGroup=await insert("class_groups",{teacher_id,workplace_id:second,name:"Other group"});
    for(const student_id of students){
      expect((await admin.from("workplace_enrollments").insert({
        teacher_id,workplace_id:first,student_id,starts_on:old.slice(0,10),source:"manual",
      })).error).toBeNull();
      expect((await admin.from("group_enrollments").insert({
        teacher_id,workplace_id:first,group_id:group,student_id,created_at:old,
      })).error).toBeNull();
    }
    const lesson=(title:string,starts_at:string,options:Record<string,unknown>={})=>
      insert("teaching_sessions",{teacher_id,workplace_id:first,group_id:group,title,starts_at,
        duration_minutes:30,status:"scheduled",local_timezone:"UTC",...options});
    const ended=await lesson("Mixed evidence attendance",yesterday+"T08:00:00Z");
    const marked=await lesson("All decisions recorded",yesterday+"T09:00:00Z");
    const missingRoster=await lesson("No recorded roster",yesterday+"T10:00:00Z",{group_id:emptyGroup});
    const cancelled=await lesson("Cancelled not actionable",yesterday+"T11:00:00Z",{status:"cancelled",group_id:emptyGroup});
    const other=await lesson("Other school roster unknown",yesterday+"T12:00:00Z",{workplace_id:second,group_id:secondGroup});
    const outside=await lesson("Foreign not visible",yesterday+"T08:00:00Z",
      {teacher_id:foreign.id,workplace_id:external,group_id:foreignGroup});
    const cancellationCase=await lesson("Recorded cancellation evidence",yesterday+"T14:00:00Z");
    const playingAt=new Date(Date.now()-60_000).toISOString();
    const playing=await lesson("Still in progress",playingAt,{group_id:emptyGroup});
    const tool=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
    expect((await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:first,expectedSelectedWorkplaceId:null,confirmed:true,
    })).error).toBeUndefined();
    const rosters=await admin.from("session_participants").select("session_id,student_id")
      .in("session_id",[ended,marked,missingRoster,cancellationCase]).order("session_id").order("student_id");
    expect(rosters.error).toBeNull();
    expect(rosters.data?.filter(x=>x.session_id===ended).map(x=>x.student_id)).toEqual([...students].sort());
    expect(rosters.data?.filter(x=>x.session_id===missingRoster)).toEqual([]);
    const recorded=await tool("ccp_attendance_record",{
      sessionId:ended,studentId:students[0],status:"present",note:"Private fixture evidence never returned",
      expectedUpdatedAt:null,idempotencyKey:randomUUID(),
    });
    expect(recorded.error).toBeUndefined();
    const cancellation=await tool("ccp_session_attendance_set",{
      sessionId:cancellationCase,studentId:students[0],status:"teacher_cancelled",noticeAt:null,
      expectedUpdatedAt:null,idempotencyKey:randomUUID(),confirmed:true,notifyFamily:false,
      cancelReason:"Synthetic explicit cancellation without notification",
    });
    expect(cancellation.error).toBeUndefined();
    const revision=await admin.from("teaching_sessions").select("updated_at").eq("id",marked).single();
    expect(revision.error).toBeNull();
    const done=await tool("ccp_sessions_complete",{
      sessionId:marked,expectedUpdatedAt:revision.data!.updated_at,idempotencyKey:randomUUID(),confirmed:true,
      attendance:students.map(studentId=>({studentId,status:"present",expectedUpdatedAt:null})),
    });
    expect(done.error).toBeUndefined();
    const removedMembership=await tool("ccp_groups_unenroll",{
      groupId:group,studentId:students[1],idempotencyKey:randomUUID(),confirmed:true,
    });
    expect(removedMembership.error).toBeUndefined();
    const lifecycle=await tool("ccp_students_lifecycle_preview",{studentId:students[1]});
    expect(lifecycle.error).toBeUndefined();
    expect(lifecycle.data.canArchive).toBe(true);
    const archived=await tool("ccp_students_lifecycle_commit",{
      studentId:students[1],mode:"archive",expectedUpdatedAt:lifecycle.data.expectedUpdatedAt,
      selectedWorkplaceIds:[],requestId:randomUUID(),reason:"Review frozen past attendance after archive",
      confirmed:true,
    });
    expect(archived.error).toBeUndefined();
    expect(archived.data.archived).toBe(true);
    const archivedRoster=await admin.from("session_participants").select("student_id")
      .eq("session_id",ended).order("student_id");
    expect(archivedRoster.error).toBeNull();
    expect(archivedRoster.data?.map(row=>row.student_id)).toEqual([...students].sort());

    const decisions=async()=>admin.from("session_attendance").select("session_id,student_id,status,updated_at")
      .in("session_id",[ended,marked,missingRoster,cancellationCase]).order("session_id").order("student_id");
    const sessions=()=>admin.from("teaching_sessions").select("id,updated_at,status")
      .eq("teacher_id",teacher_id).order("id");
    const originalSessions=await sessions();
    expect(originalSessions.error).toBeNull();
    const before=await decisions();
    expect(before.error).toBeNull();
    expect(before.data?.filter(row=>row.session_id===ended)).toEqual([
      {session_id:ended,student_id:students[0],status:"present",updated_at:expect.any(String)},
    ]);
    const rosterUrl=(id:string)=>"/api/coaching/sessions/"+id+"/roster?dailyWorkplaceId="+first;
    const get=await page.request.get(rosterUrl(ended));
    expect(get.status(),await get.text()).toBe(200);
    const preview=await get.json();
    const mcp=await tool("ccp_sessions_roster_preview",{sessionId:ended,dailyWorkplaceId:first});
    expect(mcp.error).toBeUndefined();
    expect(mcp.data).toEqual(preview);
    expect(preview).toMatchObject({sessionId:ended,workplaceId:first,title:"Mixed evidence attendance",
      requiresConfirmation:true,updatedAt:expect.any(String)});
    expect(preview.participants.map((p:{studentId:string})=>p.studentId)).toEqual([...students].sort());
    const regular=await tool("ccp_sessions_roster_preview",{sessionId:ended});
    expect(regular.data.updatedAt).toBe(preview.updatedAt);
    for(const [id,status,code] of [
      [outside,404,"NOT_FOUND"],[other,404,"NOT_FOUND"],[randomUUID(),404,"NOT_FOUND"],
      [playing,409,"LESSON_NOT_ENDED"],[missingRoster,409,"LESSON_ROSTER_UNAVAILABLE"],
      [cancellationCase,409,"LESSON_CANCELLATION_REVIEW_REQUIRED"],[cancelled,409,"LESSON_NOT_SCHEDULED"],[marked,409,"LESSON_NOT_SCHEDULED"],
    ] as const){
      const response=await page.request.get(rosterUrl(id));
      expect(response.status(),await response.text()).toBe(status);
      expect((await response.json()).code).toBe(code);
      expect((await tool("ccp_sessions_roster_preview",{sessionId:id,dailyWorkplaceId:first})).error?.code).toBe(code);
    }
    const lessonUrl="/coaching?recordSession="+ended+"&recordWorkplace="+first+"#lesson-completion";
    await page.goto("/dashboard?date="+yesterday);
    const navigation=page.getByRole("link",{name:"Record and complete Mixed evidence attendance"});
    await expect(navigation).toHaveAttribute("href",lessonUrl);
    await expect(page.getByRole("link",{name:"Record and complete Recorded cancellation evidence"})).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Find attendance for Recorded cancellation evidence"})).toBeVisible();
    await navigation.click();
    const panel=page.getByRole("region",{name:"Complete coaching lesson"});
    const commit=panel.getByRole("button",{name:"Complete lesson",exact:true});
    const approve=panel.getByRole("checkbox");
    const fill=async()=>{
      await expect(panel.locator("form")).toHaveAttribute("data-session-id",ended);
      await expect(panel.getByRole("combobox",{name:"Lesson to complete"})).toHaveCount(0);
      await expect(panel.getByRole("combobox",{name:"Attendance for "+names[0]})).toHaveValue("present");
      await panel.getByRole("combobox",{name:"Attendance for "+names[1]}).selectOption("absent");
      await expect(commit).toBeDisabled();
      await approve.check();
      await expect(commit).toBeEnabled();
    };
    await fill();
    expect((await sessions()).data).toEqual(originalSessions.data);
    expect((await decisions()).data).toEqual(before.data);
    expect((await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:second,expectedSelectedWorkplaceId:first,confirmed:true,
    })).error).toBeUndefined();
    await commit.click();
    await expect(panel.getByRole("alert")).toContainText("Your workplace selection changed");
    await expect(panel.locator("form")).toHaveCount(0);
    expect((await sessions()).data).toEqual(originalSessions.data);
    expect((await decisions()).data).toEqual(before.data);
    expect((await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:first,expectedSelectedWorkplaceId:second,confirmed:true,
    })).error).toBeUndefined();
    await panel.getByRole("button",{name:"Reload selected roster"}).click();
    await fill();
    const edited=await tool("ccp_sessions_edit",{sessionId:ended,changes:{title:"Updated exact lesson title"},
      expectedUpdatedAt:preview.updatedAt,idempotencyKey:randomUUID(),confirmed:true});
    expect(edited.error).toBeUndefined();
    await commit.click();
    await expect(panel.getByRole("alert")).toContainText("Lesson or attendance changed");
    expect((await decisions()).data).toEqual(before.data);
    await panel.getByRole("button",{name:"Reload selected roster"}).click();
    await fill();
    await commit.click();
    await expect(panel.getByRole("status")).toContainText("committed atomically");
    const saved=await tool("ccp_sessions_details",{sessionId:ended});
    expect(saved.data).toMatchObject({id:ended,status:"completed",title:"Updated exact lesson title"});
    const markedAfter=await decisions();
    expect(markedAfter.error).toBeNull();
    expect(markedAfter.data?.filter(row=>row.session_id===ended).map(row=>[row.student_id,row.status]).sort())
      .toEqual([[students[0],"present"],[students[1],"absent"]].sort());
    const untouched=(await sessions()).data?.filter(row=>row.id!==ended);
    expect(untouched).toEqual(originalSessions.data?.filter(row=>row.id!==ended));
    await page.goto("/coaching?recordSession="+outside+"&recordWorkplace="+first+"#lesson-completion");
    await expect(panel.getByRole("alert")).toContainText("not available for exact completion");
    await expect(panel.locator("form")).toHaveCount(0);
    await page.goto("/coaching?recordSession="+cancellationCase+"&recordWorkplace="+first);
    await expect(panel.getByRole("alert")).toContainText("Review it under Attendance");
    await expect(panel.locator("form")).toHaveCount(0);
    expect(markedAfter.data?.filter(row=>row.session_id===cancellationCase))
      .toEqual(before.data?.filter(row=>row.session_id===cancellationCase));
    await page.goto("/coaching");
    await expect(panel.getByRole("combobox",{name:"Lesson to complete"})).toBeVisible();
  }finally{
    for(const id of identities) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
