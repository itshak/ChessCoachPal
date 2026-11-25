import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-professional-day-end-close-review distinguishes ended unconfirmed lessons from recorded attendance",async({page,request})=>{
  test.setTimeout(120_000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(url).hostname);
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const ids:string[]=[];
  const password="SyntheticDayEnd456!";
  async function tenant(){
    const email="day-end-"+randomUUID()+"@example.invalid";
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
    expect(created.error).toBeNull();
    const id=created.data.user!.id;
    ids.push(id);
    expect((await admin.from("teachers").insert({id,email,display_name:"Day-end fixture",
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
    expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:"UTC"})).error).toBeNull();
    const place=(teacher_id:string,name:string)=>insert("workplaces",{
      teacher_id,name,timezone:"UTC",currency:"USD",locale:"en",kind:"professional",policy:{},
    });
    const first=await place(teacher_id,"Day-end School"), second=await place(teacher_id,"Day-end Other");
    const external=await place(foreign.id,"Day-end Foreign");
    const group=(teacher_id:string,workplace_id:string,name:string)=>insert("class_groups",{teacher_id,workplace_id,name});
    const students=await Promise.all(["Private day-end learner A","Private day-end learner B"]
      .map(name=>insert("students",{teacher_id,name})));
    const now=new Date();
    const date=new Date(now.getTime()-86400_000).toISOString().slice(0,10);
    const enrolled=new Date(now.getTime()-7*86400_000).toISOString();
    const roster=await group(teacher_id,first,"Day-end frozen group");
    const empty=await group(teacher_id,first,"Day-end group without roster");
    const otherGroup=await group(teacher_id,second,"Other workplace group");
    const foreignGroup=await group(foreign.id,external,"Foreign workplace group");
    for(const student_id of students){
      expect((await admin.from("workplace_enrollments").insert({teacher_id,workplace_id:first,student_id,
        starts_on:enrolled.slice(0,10),source:"manual"})).error).toBeNull();
      expect((await admin.from("group_enrollments").insert({teacher_id,workplace_id:first,group_id:roster,
        student_id,created_at:enrolled})).error).toBeNull();
    }
    const lesson=(title:string,starts_at:string,extra:Record<string,unknown>={})=>insert("teaching_sessions",{
      teacher_id,workplace_id:first,group_id:roster,title,starts_at,duration_minutes:30,status:"scheduled",local_timezone:"UTC",...extra,
    });
    const pending=await lesson("All attendance marked, not closed",date+"T08:00:00Z");
    const partial=await lesson("One attendance mark missing",date+"T09:00:00Z");
    const unknown=await lesson("Frozen roster unknown",date+"T10:00:00Z",{group_id:empty});
    const closed=await lesson("Already closed",date+"T11:00:00Z");
    const cancelled=await lesson("Cancelled lesson excluded",date+"T12:00:00Z",{status:"cancelled",group_id:empty});
    const other=await lesson("Other workplace awaiting",date+"T13:00:00Z",{workplace_id:second,group_id:otherGroup});
    const outside=await lesson("Foreign lesson excluded",date+"T14:00:00Z",
      {teacher_id:foreign.id,workplace_id:external,group_id:foreignGroup});
    const playingAt=new Date(now.getTime()-60_000).toISOString();
    const playing=await lesson("Still in progress",playingAt,{group_id:empty});
    const tool=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
    expect((await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:first,expectedSelectedWorkplaceId:null,confirmed:true,
    })).error).toBeUndefined();
    for(const [sessionId,studentId] of [[pending,students[0]],[pending,students[1]],[partial,students[0]]]){
      expect((await tool("ccp_attendance_record",{sessionId,studentId,status:"present",note:"Private note not returned",
        expectedUpdatedAt:null,idempotencyKey:randomUUID()})).error).toBeUndefined();
    }
    const revision=await admin.from("teaching_sessions").select("updated_at").eq("id",closed).single();
    expect(revision.error).toBeNull();
    expect((await tool("ccp_sessions_complete",{sessionId:closed,expectedUpdatedAt:revision.data!.updated_at,
      idempotencyKey:randomUUID(),confirmed:true,
      attendance:students.map(studentId=>({studentId,status:"present",expectedUpdatedAt:null})),
    })).error).toBeUndefined();
    const snapshot=async()=>Promise.all(["teaching_sessions","session_attendance","invoices"].map(async table=>{
      const rows=await admin.from(table).select("*").eq("teacher_id",teacher_id).order("id");
      expect(rows.error,table).toBeNull();
      return rows.data;
    }));
    const before=await snapshot();
    const base="/api/dashboard/summary";
    const read=async(date:string,workplaceId?:string|null)=>{
      const response=await page.request.get(base+"?date="+date+"&closeReview=1"+
        (workplaceId===undefined?"":"&workplaceId="+(workplaceId??"all")));
      expect(response.status(),await response.text()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      const web=await response.json();
      const mcp=await tool("ccp_dashboard_summary",{date,closeReview:true,...(workplaceId===undefined?{}:{workplaceId})});
      expect(mcp.error).toBeUndefined();expect(mcp.data).toEqual(web);
      expect(web.daily.closeReview.status).toBe("ready");
      return web.daily.closeReview.sessions as {id:string;attendance:string;missingCount:number|null;completionHref?:string;scheduleHref:string|null}[];
    };
    const ordinary=await page.request.get(base+"?date="+date);
    expect((await ordinary.json()).daily.closeReview).toBeUndefined();
    expect((await page.request.get(base+"?closeReview=1")).status()).toBe(400);
    expect((await page.request.get(base+"?date="+date+"&closeReview=0")).status()).toBe(400);
    expect((await page.request.get(base+"?date="+date+"&closeReview=1&closeReview=1")).status()).toBe(400);
    expect((await tool("ccp_dashboard_summary",{closeReview:true})).error?.code).toBe("VALIDATION_ERROR");
    expect((await page.request.get(base+"?date="+date+"&closeReview=1&workplaceId="+external)).status()).toBe(404);
    expect((await tool("ccp_dashboard_summary",{date,closeReview:true,workplaceId:external})).error?.code).toBe("WORKPLACE_NOT_FOUND");
    const rows=await read(date);
    expect(rows.map(r=>[r.id,r.attendance,r.missingCount])).toEqual([[pending,"marked",0],[partial,"missing",1],[unknown,"unknown",null]]);
    const serialized=JSON.stringify(rows);
    for(const confidential of [...students,"Private note not returned",outside,closed,cancelled])expect(serialized).not.toContain(confidential);
    const all=await read(date,null);
    expect(all.map(r=>r.id)).toEqual([pending,partial,unknown,other]);
    expect(all.find(r=>r.id===other)?.scheduleHref).toBeNull();
    expect(all.find(r=>r.id===other)?.completionHref).toBeUndefined();
    expect((await read(playingAt.slice(0,10))).some(r=>r.id===playing)).toBe(false);
    await page.setViewportSize({width:320,height:820});
    await page.goto("/dashboard?date="+date);
    const review=page.getByRole("region",{name:"Day-end review"});
    expect(await review.getByRole("listitem").count()).toBe(0);
    const open=review.getByRole("link",{name:"Show lessons awaiting completion"});
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(review.getByRole("listitem")).toHaveCount(3);
    await expect(review.getByText("Attendance already marked")).toBeVisible();
    await expect(review.getByText("1 attendance decision missing")).toBeVisible();
    await expect(review.getByText("Frozen roster or attendance evidence is unavailable")).toBeVisible();
    await expect(review.getByRole("link",{name:"Record and complete All attendance marked, not closed"}))
      .toHaveAttribute("href",rows[0].completionHref!);
    await expect(review.getByRole("listitem").filter({hasText:"Frozen roster unknown"})
      .getByRole("link",{name:/Record and complete/})).toHaveCount(0);
    await expect(page.getByRole("region",{name:"Attendance to review"}).getByText("One attendance mark missing")).toHaveCount(0);
    expect(await review.evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(await review.evaluate(el=>el.clientWidth)+1);
    expect(await snapshot()).toEqual(before);
  }finally{
    for(const id of ids)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
