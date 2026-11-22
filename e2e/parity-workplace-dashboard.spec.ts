import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY: dashboard browser, HTTP and delegated MCP apply the same workplace scope",async({page,request})=>{
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const identities:string[]=[];
  const password="SyntheticScopedDashboard123!";
  async function teacher(){
    const email="dashboard-scope-"+randomUUID()+"@example.invalid";
    const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
    expect(identity.error).toBeNull();
    const id=identity.data.user!.id;
    identities.push(id);
    expect((await admin.from("teachers").insert({id,email,display_name:"Dashboard parity",
      preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
    return {id,email};
  }
  async function row(table:string,values:Record<string,unknown>){
    const result=await admin.from(table).insert(values).select("id").single();
    expect(result.error,table+" fixture").toBeNull();
    return result.data!.id as string;
  }
  try{
    const owner=await teacher(),foreign=await teacher();
    const teacher_id=owner.id;
    await configureSyntheticStudentCapacity(admin,teacher_id,6,4);
    const place=(name:string,archived_at?:string)=>row("workplaces",{
      teacher_id,name,kind:"professional",timezone:"UTC",currency:"USD",locale:"en",policy:{},archived_at,
    });
    const a=await place("Dashboard A"),b=await place("Dashboard B"),historic=await place("Old workplace","2025-01-01");
    const foreignPlace=await admin.from("workplaces").select("id")
      .eq("teacher_id",foreign.id).eq("kind","personal").single();
    expect(foreignPlace.error).toBeNull();
    const student=(name:string)=>row("students",{teacher_id,name});
    const shared=await student("Dashboard shared learner"),other=await student("Dashboard B learner");
    const ended=await student("Dashboard ended learner");
    const day=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
    for(const [workplace_id,student_id,starts_on,ends_on] of [
      [a,shared,day(-20),null],[b,shared,day(-20),null],[b,other,day(-20),null],[a,ended,day(-30),day(-10)],
    ]){
      expect((await admin.from("workplace_enrollments").insert({
        teacher_id,workplace_id,student_id,source:"manual",starts_on,ends_on,
      })).error).toBeNull();
    }
    for(const [workplace_id,name] of [[a,"A Class"],[b,"B First Class"],[b,"B Second Class"]])
      await row("class_groups",{teacher_id,workplace_id,name});
    const lesson=(workplace_id:string,student_id:string,title:string,offset:number,hour:string)=>row("teaching_sessions",{
      teacher_id,workplace_id,student_id,title,status:"scheduled",duration_minutes:30,
      starts_at:day(offset)+"T"+hour+":00:00Z",local_timezone:"UTC",
    });
    await lesson(a,shared,"A recent fact", -2,"10");
    await lesson(b,shared,"B recent fact", -1,"11");
    await lesson(a,shared,"A upcoming fact", 2,"10");
    await lesson(b,other,"B upcoming fact", 2,"11");
    await lesson(a,ended,"A older historical fact", -15,"10");

    const call=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
    const tools=await call.listTools();
    expect(tools.find(x=>x.name==="ccp_dashboard_summary")?.inputSchema?.properties)
      .toHaveProperty("workplaceId");
    const selected=await call("ccp_workplace_context_set",{
      selectedWorkplaceId:a,expectedSelectedWorkplaceId:null,confirmed:true,
    });
    expect(selected.error).toBeUndefined();
    const summary="/api/dashboard/summary";
    const compare=async(query:string,args:Record<string,unknown>,expected:Record<string,unknown>)=>{
      const browser=await page.request.get(summary+query);
      expect(browser.status(),await browser.text()).toBe(200);
      const mcp=await call("ccp_dashboard_summary",args);
      expect(mcp.error).toBeUndefined();
      expect(mcp.data).toEqual(await browser.json());
      expect(mcp.data).toEqual(expected);
    };
    const counters=(workplaceId:string|null,studentCount:number,groupCount:number,sessionsThisWeek:number)=>({
      workplaceId,studentCount,groupCount,sessionsThisWeek,workplaceCount:4,
      scopedWorkplaceCount:workplaceId?1:4,
    });
    await compare("",{},counters(a,1,1,1));
    await compare("?workplaceId=all",{workplaceId:null},counters(null,3,3,2));
    await compare("?workplaceId="+b,{workplaceId:b},counters(b,2,2,1));
    await compare("?workplaceId="+historic,{workplaceId:historic},counters(historic,0,0,0));
    const blocked=await page.request.get(summary+"?workplaceId="+foreignPlace.data!.id);
    expect(blocked.status()).toBe(404);
    expect((await blocked.json()).code).toBe("WORKPLACE_NOT_FOUND");
    expect((await call("ccp_dashboard_summary",{workplaceId:foreignPlace.data!.id})).error?.code)
      .toBe("WORKPLACE_NOT_FOUND");
    expect((await page.request.get(summary+"?workplaceId=wrong")).status()).toBe(400);
    expect((await call("ccp_dashboard_summary",{workplaceId:"wrong"})).error?.code)
      .toBe("VALIDATION_ERROR");
    await compare("",{},counters(a,1,1,1)); // Read-only overrides did not persist.
    await page.goto("/dashboard");
    for(const label of ["Active students","Workplaces","Class groups"]){
      const card=page.getByText(label,{exact:true}).locator("..");
      await expect(card.getByText("1",{exact:true})).toBeVisible();
    }
    for(const text of ["Dashboard shared learner","A upcoming fact","A recent fact","A older historical fact"])
      await expect(page.getByText(text,{exact:true})).toBeVisible();
    for(const text of ["Dashboard B learner","Dashboard ended learner","B upcoming fact","B recent fact"])
      await expect(page.getByText(text,{exact:true})).toHaveCount(0);
  }finally{
    for(const id of identities) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
