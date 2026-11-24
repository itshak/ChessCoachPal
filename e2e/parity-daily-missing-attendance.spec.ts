import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-daily-missing-attendance",async({page,request})=>{
  test.setTimeout(120_000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const auth={persistSession:false,autoRefreshToken:false};
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth});
  const identities:string[]=[];
  const password="SyntheticDailyAttendance456!";
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
    await lesson("Cancelled not actionable",yesterday+"T11:00:00Z",{status:"cancelled",group_id:emptyGroup});
    const other=await lesson("Other school roster unknown",yesterday+"T12:00:00Z",{workplace_id:second,group_id:secondGroup});
    const outside=await lesson("Foreign not visible",yesterday+"T08:00:00Z",
      {teacher_id:foreign.id,workplace_id:external,group_id:foreignGroup});
    const playingAt=new Date(Date.now()-60_000).toISOString();
    const playing=await lesson("Still in progress",playingAt,{group_id:emptyGroup});
    const tool=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
    expect((await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:first,expectedSelectedWorkplaceId:null,confirmed:true,
    })).error).toBeUndefined();
    const rosters=await admin.from("session_participants").select("session_id,student_id")
      .in("session_id",[ended,marked,missingRoster]).order("session_id").order("student_id");
    expect(rosters.error).toBeNull();
    expect(rosters.data?.filter(x=>x.session_id===ended).map(x=>x.student_id)).toEqual([...students].sort());
    expect(rosters.data?.filter(x=>x.session_id===missingRoster)).toEqual([]);
    const recorded=await tool("ccp_attendance_record",{
      sessionId:ended,studentId:students[0],status:"present",note:"Private fixture evidence never returned",
      expectedUpdatedAt:null,idempotencyKey:randomUUID(),
    });
    expect(recorded.error).toBeUndefined();
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
      .in("session_id",[ended,marked,missingRoster]).order("session_id").order("student_id");
    const sessions=()=>admin.from("teaching_sessions").select("id,updated_at,status")
      .eq("teacher_id",teacher_id).order("id");
    const originalSessions=await sessions();
    expect(originalSessions.error).toBeNull();
    const before=await decisions();
    expect(before.error).toBeNull();
    expect(before.data?.filter(row=>row.session_id===ended)).toEqual([
      {session_id:ended,student_id:students[0],status:"present",updated_at:expect.any(String)},
    ]);
    const read=async(date:string,workplaceId?:string|null)=>{
      const route="/api/dashboard/summary?date="+date+
        (workplaceId===undefined?"":"&workplaceId="+(workplaceId??"all"));
      const response=await page.request.get(route);
      expect(response.status(),await response.text()).toBe(200);
      const web=await response.json();
      const mcp=await tool("ccp_dashboard_summary",{date,...(workplaceId===undefined?{}:{workplaceId})});
      expect(mcp.error).toBeUndefined();
      expect(mcp.data).toEqual(web);
      expect(web.daily.missingAttendance.status).toBe("ready");
      return web.daily.missingAttendance.sessions;
    };
    const rows=await read(yesterday);
    const href="/schedule?session="+ended+"#lesson-attendance-"+ended;
    expect(rows.map(({id,reason,missingCount,scheduleHref}:{
      id:string;reason:string;missingCount:number|null;scheduleHref:string|null;
    })=>({id,reason,missingCount,scheduleHref}))).toEqual([
      {id:ended,reason:"ATTENDANCE_MISSING",missingCount:1,scheduleHref:href},
      {id:missingRoster,reason:"ROSTER_NOT_RECORDED",missingCount:null,scheduleHref:null},
    ]);
    expect(JSON.stringify(rows)).not.toContain(students[1]);
    expect(JSON.stringify(rows)).not.toContain("Private fixture evidence");
    expect((await read(yesterday,null)).map((row:{id:string})=>row.id)).toEqual([ended,missingRoster,other]);
    expect((await read(playingAt.slice(0,10))).some((row:{id:string})=>row.id===playing)).toBe(false);
    expect((await page.request.get("/api/dashboard/summary?date="+yesterday+"&workplaceId="+external)).status()).toBe(404);
    expect((await tool("ccp_dashboard_summary",{date:yesterday,workplaceId:external})).error?.code)
      .toBe("WORKPLACE_NOT_FOUND");
    expect(JSON.stringify(rows)).not.toContain(outside);
    await page.goto("/dashboard?date="+yesterday);
    const queue=page.getByRole("region",{name:"Attendance to review"});
    const navigation=queue.getByRole("link",{name:"Find attendance for Mixed evidence attendance"});
    await expect(navigation).toHaveAttribute("href",href);
    await expect(queue.getByText("1 attendance decision missing")).toBeVisible();
    await expect(queue.getByText("No frozen roster was recorded.")).toBeVisible();
    await expect(queue.getByRole("link",{name:"Record and complete Mixed evidence attendance"})).toBeVisible();
    await expect(queue.getByRole("listitem").filter({hasText:"No recorded roster"}).getByRole("link")).toHaveCount(0);
    await navigation.click();
    await expect(page.locator("#lesson-attendance-"+ended)).toBeVisible();
    const after=await decisions();
    expect(after.error).toBeNull();
    expect(after.data).toEqual(before.data);
    expect((await sessions()).data).toEqual(originalSessions.data);
  }finally{
    for(const id of identities) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
