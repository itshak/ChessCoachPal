import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";
import {planCanonicalOccurrences,type CanonicalSlot} from "../lib/server/canonical-calendar-service";

test("PARITY:PARITY-daily-canonical-upcoming",async({page,request},testInfo)=>{
  test.setTimeout(180_000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
  const identities:string[]=[];
  const password="SyntheticDailyQueue456!";
  async function teacher(){
    const email="daily-coaching-"+randomUUID()+"@example.invalid";
    const user=await admin.auth.admin.createUser({email,password,email_confirm:true});
    expect(user.error).toBeNull();
    const id=user.data.user!.id;
    identities.push(id);
    expect((await admin.from("teachers").insert({id,email,display_name:"Coaching today fixture",
      preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
    return {id,email};
  }
  async function row(table:string,values:Record<string,unknown>){
    const result=await admin.from(table).insert(values).select("id").single();
    expect(result.error,table+" fixture: "+String(values.title??values.name??"")).toBeNull();
    return result.data!.id as string;
  }
  try{
    const owner=await teacher(),foreign=await teacher(),teacher_id=owner.id;
    const zone="America/New_York";
    const place=(teacher_id:string,name:string,timezone:string)=>row("workplaces",{
      teacher_id,name,kind:"professional",timezone,currency:"USD",locale:"en",policy:{},
    });
    const a=await place(owner.id,"School",zone), b=await place(owner.id,"Other school","UTC");
    const x=await place(foreign.id,"Foreign school","UTC");
    expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:"UTC"})).error).toBeNull();
    const classGroup=(teacher_id:string,workplace_id:string,name:string)=>row("class_groups",{teacher_id,workplace_id,name});
    const group=await classGroup(owner.id,a,"Daily group"), otherGroup=await classGroup(owner.id,b,"Other group");
    const foreignGroup=await classGroup(foreign.id,x,"Foreign group");
    // A future 23-hour New York date ensures there is no UTC/24-hour assumption.
    const year=new Date().getUTCFullYear()+1;
    const sunday=8+(7-new Date(Date.UTC(year,2,1)).getUTCDay())%7;
    const date=year+"-03-"+String(sunday).padStart(2,"0");
    const tomorrow=year+"-03-"+String(sunday+1).padStart(2,"0");
    const prefix="Daily queue ";
    const lesson=(title:string,starts_at:string,opts:Record<string,unknown>={})=>row("teaching_sessions",{
      teacher_id,workplace_id:a,group_id:group,title:prefix+title,starts_at,duration_minutes:45,
      status:"scheduled",local_timezone:"UTC",...opts,
    });
    await lesson("before midnight",date+"T04:00:00Z");
    const first=await lesson("first local instant",date+"T05:00:00Z");
    const middle1=await lesson("first morning",date+"T09:00:00Z");
    const middle2=await lesson("second morning",date+"T10:00:00Z");
    const last=await lesson("last local hour",tomorrow+"T03:00:00Z");
    await lesson("next midnight",tomorrow+"T04:00:00Z");
    await lesson("canceled",date+"T10:30:00Z",{status:"cancelled"});
    const oldInstant=new Date(Date.now()-86400000).toISOString();
    const old=await lesson("old start",oldInstant);
    const other=await lesson("other school",date+"T12:00:00Z",{workplace_id:b,group_id:otherGroup});
    const foreignId=await lesson("foreign",date+"T12:30:00Z",{teacher_id:foreign.id,workplace_id:x,group_id:foreignGroup});
    const tool=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
    const properties=(await tool.listTools()).find(t=>t.name==="ccp_dashboard_summary")?.inputSchema?.properties;
    expect(properties).toHaveProperty("date");
    expect(properties).toHaveProperty("upcomingAfter");
    expect((await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:a,expectedSelectedWorkplaceId:null,confirmed:true,
    })).error).toBeUndefined();
    const api="/api/dashboard/summary";
    const read=async(query:string,args:Record<string,unknown>)=>{
      const response=await page.request.get(api+query);
      expect(response.status(),await response.text()).toBe(200);
      const web=await response.json();
      expect(await tool("ccp_dashboard_summary",args)).toMatchObject({data:web});
      return web;
    };
    const ids=(v:{daily:{sessions:{id:string}[]}})=>v.daily.sessions.map(r=>r.id);
    const legacy=await read("",{});
    expect(Object.keys(legacy).sort()).toEqual([
      "groupCount","scopedWorkplaceCount","sessionsThisWeek","studentCount","workplaceCount","workplaceId",
    ]);
    const web=await read("?date="+date,{date});
    expect(web.daily).toMatchObject({date,timeZone:zone,limit:24,truncated:false});
    expect(ids(web)).toEqual([first,middle1,middle2,last]);
    for(const result of web.daily.sessions){
      expect(Object.keys(result).sort()).toEqual(["duration_minutes","id","starts_at","title","workplace_id"]);
      expect(result.duration_minutes).toBe(45);
    }
    const all=await read("?workplaceId=all&date="+date,{workplaceId:null,date});
    expect(all.daily.timeZone).toBe("UTC");
    expect(ids(all)).toContain(other);
    expect(ids(all)).not.toContain(last);
    expect(ids(all)).not.toContain(foreignId);
    expect(ids(await read("?workplaceId="+b+"&date="+date,{workplaceId:b,date}))).toEqual([other]);
    const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"});
    const oldDate=fmt.format(new Date(oldInstant));
    expect(ids(await read("?date="+oldDate,{date:oldDate}))).not.toContain(old);
    expect((await page.request.get(api+"?workplaceId="+x+"&date="+date)).status()).toBe(404);
    expect((await tool("ccp_dashboard_summary",{workplaceId:x,date})).error?.code).toBe("WORKPLACE_NOT_FOUND");
    const invalid=year+"-02-30";
    expect((await page.request.get(api+"?date="+invalid)).status()).toBe(400);
    expect((await tool("ccp_dashboard_summary",{date:invalid})).error?.code).toBe("VALIDATION_ERROR");
    expect((await page.request.get(api+"?date="+date+"&date="+tomorrow)).status()).toBe(400);
    await page.goto("/dashboard");
    const queue=page.getByRole("region",{name:"Coaching today"});
    await expect(queue.getByLabel("Coaching date")).toHaveValue(fmt.format(new Date()));
    const agenda=page.locator("[data-home-agenda]");
    await expect(agenda.locator('[data-next-lesson="true"]')).toContainText(prefix+"before midnight");
    await expect(agenda.getByText("Next lesson",{exact:true})).toBeVisible();
    await expect(agenda.locator("[data-agenda-date]")).toHaveCount(0);
    await expect(agenda.getByText(prefix+"canceled",{exact:true})).toHaveCount(0);
    await expect(agenda.getByText(prefix+"other school",{exact:true})).toHaveCount(0);
    await page.screenshot({path:testInfo.outputPath("adaptive-home-desktop.png"),fullPage:true});
    await queue.getByLabel("Coaching date").fill(date);
    await queue.getByRole("button",{name:"Show lessons"}).click();
    await expect(page).toHaveURL(new RegExp("date="+date));
    const firstRow=queue.getByRole("listitem").filter({hasText:prefix+"first local instant"});
    await expect(firstRow.locator("time")).toHaveAttribute("datetime",web.daily.sessions[0].starts_at);
    await expect(queue.getByRole("listitem")).toHaveCount(4);
    await expect(queue.getByText(prefix+"canceled")).toHaveCount(0);
    await expect(queue.getByText(prefix+"other school")).toHaveCount(0);
    expect((await tool("ccp_workplace_context_get",{})).data.selectedWorkplaceId).toBe(a);

    await configureSyntheticStudentCapacity(admin,teacher_id,6,4);
    const pupil=await row("students",{teacher_id,name:"Daily schedule pupil"});
    expect((await tool("ccp_workplaces_enroll",{workplaceId:a,studentId:pupil,idempotencyKey:randomUUID()})).error)
      .toBeUndefined();
    const slotId=randomUUID();
    const slotResult=await page.request.post("/api/coaching/calendar/slots",{data:{
      workplaceId:a,studentId:pupil,startDate:date,endDate:date,dayOfWeek:0,startTime:"13:00",
      durationMinutes:30,rateCents:0,isHomeVisit:false,idempotencyKey:slotId,
    }});
    expect(slotResult.status(),await slotResult.text()).toBe(200);
    expect(ids(await read("?date="+date,{date}))).toEqual(ids(web));
    const before=await admin.from("teaching_sessions").select("id").eq("slot_id",slotId);
    expect(before.error).toBeNull();
    expect(before.data).toEqual([]);
    const signed=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
    expect((await signed.auth.signInWithPassword({email:owner.email,password})).error).toBeNull();
    const slot=await signed.from("lesson_slots").select("*").eq("id",slotId).single();
    expect(slot.error).toBeNull();
    const planned=planCanonicalOccurrences(teacher_id,[slot.data as CanonicalSlot],[
      {id:a,timezone:zone},
    ],a,zone,date,date);
    expect(planned).toHaveLength(1);
    expect((await signed.rpc("ccp_canonical_slot_materialize",{p_rows:planned})).error).toBeNull();
    const occurrence=await signed.from("teaching_sessions").select("id").eq("slot_id",slotId).single();
    expect(occurrence.error).toBeNull();
    expect(ids(await read("?date="+date,{date}))).toEqual([first,middle1,middle2,occurrence.data!.id,last]);
    expect((await signed.from("teaching_sessions").select("id").eq("slot_id",slotId)).data)
      .toEqual([{id:occurrence.data!.id}]);

    const originalViewport=page.viewportSize();
    await page.setViewportSize({width:1440,height:900});
    await page.goto("/schedule?week="+date+"&view=week");
    const attendanceButton=page.locator("#lesson-attendance-"+occurrence.data!.id);
    await expect(attendanceButton).toBeVisible();
    const weekUrl=page.url();
    const record=page.locator('[data-calendar-session="'+occurrence.data!.id+'"] > button').first();
    await record.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Recorded participants",{exact:false})).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("link",{name:"Daily schedule pupil",exact:true})).toBeVisible();
    expect(page.url()).toBe(weekUrl);
    await page.screenshot({path:testInfo.outputPath("calendar-desktop.png"),fullPage:true});
    await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
    await page.setViewportSize({width:820,height:1100});
    await page.screenshot({path:testInfo.outputPath("calendar-tablet.png"),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.goto("/schedule?week="+date);
    const list=page.locator('.ccp-calendar-list[data-view="auto"]');
    await expect(list).toBeVisible();
    const mobileUrl=page.url();
    await record.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(list).toBeHidden();
    await expect(page).toHaveURL(new RegExp("#calendar-detail-"+occurrence.data!.id+"$"));
    await page.screenshot({path:testInfo.outputPath("calendar-mobile-detail.png"),fullPage:true});
    await page.goBack();
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(mobileUrl);
    await expect(record).toBeFocused();
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(list).toBeHidden();
    await page.reload();
    await expect(page.getByRole("dialog").getByText("Recorded participants",{exact:false})).toBeVisible();
    await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(mobileUrl);
    await page.getByRole("navigation",{name:"Calendar view"}).getByRole("link",{name:"Month",exact:true}).click();
    await expect(page).toHaveURL(/view=month/);
    await page.locator('[data-calendar-date="'+date+'"] > a').first().click();
    await expect(page).toHaveURL(/view=day/);
    await expect(attendanceButton).toBeVisible();
    for(const [locale,heading,month] of [["he","בית","חודש"],["ru","Главная","Месяц"]]){
      expect((await tool("ccp_teacher_profile_update",{preferredLocale:locale,confirmed:true})).error).toBeUndefined();
      await page.goto("/dashboard");
      await expect(page.locator("html")).toHaveAttribute("lang",locale);
      if(locale==="he")await expect(page.locator("html")).toHaveAttribute("dir","rtl");
      await expect(page.getByRole("heading",{name:heading,exact:true})).toBeVisible();
      await page.screenshot({path:testInfo.outputPath("adaptive-home-"+locale+"-mobile.png"),fullPage:true});
      await page.goto("/schedule?week="+date);
      await expect(page.getByRole("link",{name:month,exact:true})).toBeVisible();
      await record.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({path:testInfo.outputPath("calendar-"+locale+"-mobile.png"),fullPage:true});
    }
    expect((await tool("ccp_teacher_profile_update",{preferredLocale:"en",confirmed:true})).error).toBeUndefined();
    if(originalViewport)await page.setViewportSize(originalViewport);

    const movedId=await lesson("moved actual",tomorrow+"T12:00:00Z",{group_id:null,student_id:pupil});
    const revision=await signed.from("teaching_sessions").select("updated_at").eq("id",movedId).single();
    expect(revision.error).toBeNull();
    const moved=await tool("ccp_sessions_edit",{
      sessionId:movedId,changes:{startsAt:date+"T19:00:00.000Z"},
      expectedUpdatedAt:revision.data!.updated_at,idempotencyKey:randomUUID(),confirmed:true,
    });
    expect(moved.error).toBeUndefined();
    expect(ids(await read("?date="+date,{date}))).toEqual([first,middle1,middle2,occurrence.data!.id,movedId,last]);
    expect(ids(await read("?date="+tomorrow,{date:tomorrow}))).not.toContain(movedId);

    const capDate=year+"-04-15";
    const cap=await admin.from("teaching_sessions").insert(Array.from({length:25},(_,i)=>({
      teacher_id,workplace_id:a,group_id:group,title:prefix+"limit "+i,local_timezone:zone,
      duration_minutes:20,status:"scheduled",
      starts_at:new Date(Date.parse(capDate+"T08:00:00Z")+i*30*60_000).toISOString()
        .replace(".000Z",i===23?".123456Z":".000Z"),
    }))).select("id,starts_at");
    expect(cap.error).toBeNull();
    const capped=await read("?date="+capDate,{date:capDate});
    expect(capped.daily).toMatchObject({date:capDate,limit:24,truncated:true});
    const ordered=cap.data!.sort((l,r)=>l.starts_at.localeCompare(r.starts_at)||l.id.localeCompare(r.id)).map(r=>r.id);
    expect(ids(capped)).toEqual(ordered.slice(0,24));
    const upcomingAfter=capped.daily.nextUpcomingAfter as string;
    expect(upcomingAfter).toContain(".123456");
    const after=encodeURIComponent(upcomingAfter);
    const next=await read("?date="+capDate+"&upcomingAfter="+after,{date:capDate,upcomingAfter});
    expect(next.daily).toMatchObject({date:capDate,limit:24,truncated:false,nextUpcomingAfter:null});
    expect([...ids(capped),...ids(next)]).toEqual(ordered);
    expect(Date.parse(next.daily.sessions[0].starts_at)).toBeGreaterThan(Date.parse(capped.daily.sessions[23].starts_at));

    const invalidNext=async(query:string,args:Record<string,unknown>)=>{
      const response=await page.request.get(api+query);
      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({code:"VALIDATION_ERROR"});
      expect((await tool("ccp_dashboard_summary",args)).error?.code).toBe("VALIDATION_ERROR");
    };
    await invalidNext("?date="+capDate+"&workplaceId=all&upcomingAfter="+after,
      {date:capDate,workplaceId:null,upcomingAfter});
    await invalidNext("?date="+tomorrow+"&upcomingAfter="+after,{date:tomorrow,upcomingAfter});
    await invalidNext("?upcomingAfter="+after,{upcomingAfter});
    const wrongZone=upcomingAfter.replace("America/New_York","UTC");
    await invalidNext("?date="+capDate+"&upcomingAfter="+encodeURIComponent(wrongZone),
      {date:capDate,upcomingAfter:wrongZone});
    expect((await page.request.get(api+"?date="+capDate+"&upcomingAfter="+after+"&upcomingAfter="+after)).status()).toBe(400);

    await page.goto("/dashboard?date="+capDate);
    await expect(queue.getByText("Showing the first 24 lessons.",{exact:false})).toBeVisible();
    await queue.getByRole("link",{name:"Next lessons for this date"}).click();
    await expect(queue.getByRole("listitem")).toHaveCount(1);
    await expect(queue.getByRole("listitem").first()).toContainText(next.daily.sessions[0].title);
    await expect(queue.getByRole("link",{name:"Next lessons for this date"})).toHaveCount(0);
    await queue.getByRole("link",{name:"Back to the first lessons"}).click();
    await expect(queue.getByRole("listitem")).toHaveCount(24);
    const afterRead=await admin.from("teaching_sessions").select("id").in("id",ordered);
    expect(afterRead.error).toBeNull();
    expect(afterRead.data?.map(r=>r.id).sort()).toEqual([...ordered].sort());
  }finally{
    for(const id of identities) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
