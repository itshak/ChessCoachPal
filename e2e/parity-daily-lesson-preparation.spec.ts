import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-daily-lesson-preparation uses exact frozen roster and recorded evidence only",async({page,request})=>{
  test.setTimeout(120_000);
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const identities:string[]=[];
  const password="SyntheticDailyPreparation456!";
  async function tenant(){
    const email="daily-prepare-"+randomUUID()+"@example.invalid";
    const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});
    expect(auth.error).toBeNull();
    const id=auth.data.user!.id;
    identities.push(id);
    expect((await admin.from("teachers").insert({id,email,display_name:"Preparation fixture",preferred_locale:"en",
      onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
    await configureSyntheticStudentCapacity(admin,id,8,4);
    return {id,email};
  }
  async function row(table:string,value:Record<string,unknown>){
    const result=await admin.from(table).insert(value).select("id").single();
    expect(result.error,table).toBeNull();
    return result.data!.id as string;
  }
  try{
    const owner=await tenant(), foreign=await tenant(),teacher_id=owner.id;
    const venue=(teacher_id:string,name:string)=>row("workplaces",{
      teacher_id,name,timezone:"UTC",locale:"en",currency:"USD",kind:"professional",policy:{},
    });
    const school=await venue(owner.id,"Preparation School"), club=await venue(owner.id,"Preparation Club");
    const outside=await venue(foreign.id,"Preparation Foreign");
    expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:"UTC"})).error).toBeNull();
    const learners=await Promise.all(["first","second","third"].map(name=>row("students",{
      teacher_id,name:"Private participant "+name,
    })));
    const outsider=await row("students",{teacher_id:foreign.id,name:"Foreign participant"});
    const group=await row("class_groups",{teacher_id,workplace_id:school,name:"Frozen group"});
    const empty=await row("class_groups",{teacher_id,workplace_id:school,name:"No recorded roster"});
    const day=(n:number)=>new Date(Date.now()+n*86400_000).toISOString().slice(0,10);
    expect((await admin.from("workplace_enrollments").insert({
      teacher_id:foreign.id,workplace_id:outside,student_id:outsider,source:"manual",starts_on:day(-10),
    })).error).toBeNull();
    for(const student_id of learners){
      for(const workplace_id of [school,club])expect((await admin.from("workplace_enrollments").insert({
        teacher_id,workplace_id,student_id,source:"manual",starts_on:day(-10),
      })).error).toBeNull();
      await row("group_enrollments",{teacher_id,workplace_id:school,group_id:group,student_id});
    }
    const session=(title:string,starts_at:string,fields:Record<string,unknown>)=>row("teaching_sessions",{
      teacher_id,workplace_id:school,title,starts_at,local_timezone:"UTC",duration_minutes:40,
      lesson_note:"Private shared session note",...fields,
    });
    const past=await session("Past preparation evidence",day(-2)+"T09:00:00Z",{group_id:group});
    const date=day(2);
    const individual=await session("Individual preparation",date+"T08:00:00Z",{student_id:learners[0]});
    const classLesson=await session("Group preparation",date+"T09:00:00Z",{group_id:group});
    const unknown=await session("Unknown preparation roster",date+"T10:00:00Z",{group_id:empty});
    const another=await session("Outside current workplace",date+"T11:00:00Z",{workplace_id:club,student_id:learners[0]});
    const otherTenant=await session("Other tenant",date+"T12:00:00Z",{
      teacher_id:foreign.id,workplace_id:outside,student_id:outsider,
    });
    const cancelled=await session("Cancelled preparation",date+"T13:00:00Z",{student_id:learners[0],status:"cancelled"});
    const tool=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
    expect((await tool.listTools()).find(item=>item.name==="ccp_lesson_preparation_get")?.inputSchema?.properties)
      .toHaveProperty("sessionId");
    const makeMaterial=async(title:string)=>{
      const result=await tool("ccp_learning_materials_create",{
        kind:"external_link",title,sourceUrl:"https://example.invalid/study",description:"",
        details:{},requestId:randomUUID(),
      });
      expect(result.error).toBeUndefined();
      return result.data.material.id as string;
    };
    const material=await makeMaterial("Shared rook ending evidence");
    const offsite=await makeMaterial("Other workplace private material");
    const claim=async(studentId:string,materialId:string,workplaceId:string,sessionId?:string)=>{
      const result=await tool("ccp_materials_history_record",{
        studentId,materialId,workplaceId,...(sessionId?{sessionId}:{}),occurredOn:day(-2),stage:"taught",
        note:"Private participant teaching note",requestId:randomUUID(),confirmed:true,
      });
      expect(result.error).toBeUndefined();
    };
    await claim(learners[0],material,school,past);
    await claim(learners[1],material,school,past);
    await claim(learners[0],offsite,club);
    expect((await tool("ccp_training_assignments_create",{
      studentIds:[learners[0]],materialId:material,instructions:"Private assignment instructions",
      dueOn:date,requestId:randomUUID(),confirmed:true,
    })).error).toBeUndefined();
    const cat=await admin.from("chess_skill_categories").select("id")
      .eq("teacher_id",teacher_id).order("id").limit(1).single();
    expect(cat.error).toBeNull();
    for(const verified of [true,false])await row("chess_observations",{
      teacher_id,student_id:learners[0],session_id:past,category_id:cat.data!.id,
      observation:"Private observation text",source:verified?"teacher":"agent",observed_at:day(-2)+"T10:00:00Z",
      ...(verified?{verified_at:day(-2)+"T11:00:00Z",verified_by:teacher_id}:{}),
    });
    const goal=(status:"planned"|"in_progress"|"achieved"|"abandoned")=>({
      id:randomUUID(),title:"Private goal title",status,targetDate:null,
      coachEvidence:status==="achieved"?"Private verified goal evidence":null,
    });
    const plan=async(studentId:string,status:"active"|"paused"|"completed",
      goals:ReturnType<typeof goal>[])=>{
      const result=await tool("ccp_training_plans_commit",{
        studentId,title:"Private plan title",summary:"Private plan summary",status,goals,
        requestId:randomUUID(),confirmed:true,
      });
      expect(result.error).toBeUndefined();
    };
    await plan(learners[0],"active",[goal("planned"),goal("in_progress"),goal("achieved")]);
    await plan(learners[1],"active",[goal("planned"),goal("abandoned")]);
    await plan(learners[2],"paused",[goal("planned")]);
    await plan(learners[2],"completed",[goal("achieved")]);
    const unrostered=await row("students",{teacher_id,name:"Private nonparticipant"});
    for(const [ownerId,studentId] of [[teacher_id,unrostered],[foreign.id,outsider]]){
      await row("student_training_plans",{teacher_id:ownerId,student_id:studentId,
        title:"Private unrelated active plan",status:"active",goals:[goal("planned")]});
    }
    expect((await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:school,expectedSelectedWorkplaceId:null,confirmed:true,
    })).error).toBeUndefined();
    const snapshot=async()=>Promise.all(["teaching_sessions","session_participants","material_teaching_evidence",
      "training_assignments","chess_observations","student_training_plans"].map(async table=>{
      const r=await admin.from(table).select("*").eq("teacher_id",teacher_id);
      expect(r.error).toBeNull();
      return r.data!.map(x=>JSON.stringify(x)).sort();
    }));
    const before=await snapshot();
    const route="/api/coaching/lesson-preparation?sessionId=";
    const read=async(sessionId:string)=>{
      const response=await page.request.get(route+sessionId);
      expect(response.status(),await response.text()).toBe(200);
      const website=await response.json();
      const result=await tool("ccp_lesson_preparation_get",{sessionId});
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual(website);
      return website;
    };
    const solo=await read(individual), prepared=await read(classLesson);
    expect(solo).toMatchObject({status:"ready",participantCount:1,history:{material:{participantsWithoutEvidence:0}},
      trainingGoals:{scope:"teacher_wide",status:"ready",planned:1,inProgress:1}});
    expect(prepared).toMatchObject({status:"ready",participantCount:3,
      lesson:{id:classLesson,workplaceId:school,durationMinutes:40},
      trainingGoals:{scope:"teacher_wide",status:"ready",planned:2,inProgress:1},
      history:{material:{status:"recorded",participantsWithEvidence:2,participantsWithoutEvidence:1},
        assignments:{status:"recorded",scope:"teacher_wide",count:1},verifiedObservations:{count:1}},
    });
    expect(prepared.history.material.entries).toHaveLength(1);
    expect(prepared.history.material.entries[0]).toMatchObject({materialId:material,title:"Shared rook ending evidence",stage:"taught"});
    for(const privateValue of [...learners,"Private","Other workplace","sourceUrl","mastery"])
      expect(JSON.stringify(prepared)).not.toContain(privateValue);
    expect(await read(unknown)).toMatchObject({status:"roster_not_recorded",participantCount:null,history:null,trainingGoals:null});
    for(const denied of [another,otherTenant,cancelled,past,randomUUID()]){
      expect((await page.request.get(route+denied)).status()).toBe(404);
      expect((await tool("ccp_lesson_preparation_get",{sessionId:denied})).error?.code).toBe("NOT_FOUND");
    }
    expect((await page.request.get(route+"invalid")).status()).toBe(400);
    await page.goto("/dashboard");
    const queue=page.getByRole("region",{name:"Coaching today"});
    await expect(queue.getByLabel("Coaching date")).toHaveValue(day(0));
    await expect(page.getByRole("region",{name:"Homework to review"})).toBeVisible();
    await page.goto("/dashboard?date="+date);
    await expect(queue.getByLabel("Coaching date")).toHaveValue(date);
    await queue.getByRole("link",{name:"Prepare Group preparation"}).click();
    const panel=page.getByRole("region",{name:"Lesson preparation"});
    await expect(panel.getByText("Participants with no recorded material evidence in this window: 1")).toBeVisible();
    await expect(panel.getByText("Shared rook ending evidence")).toHaveCount(1);
    await expect(panel.getByText("Current teacher-wide goals on active plans: 2 planned, 1 in progress.")).toBeVisible();
    await expect(panel.getByText("These records do not establish mastery.")).toBeVisible();
    await expect(queue.getByRole("link",{name:"Prepare Group preparation"})).toBeVisible();
    await expect(queue.getByLabel("Coaching date")).toHaveValue(date);
    await page.goto("/dashboard?date="+date+"&prepareSession="+otherTenant);
    await expect(panel.getByRole("alert")).toContainText("Upcoming lesson not found");
    await page.goto("/dashboard?date="+date+"&prepareSession=invalid");
    await expect(panel.getByRole("alert")).toContainText("Choose a valid lesson");
    await expect(queue.getByRole("link",{name:"Prepare Group preparation"})).toBeVisible();
    expect(await snapshot()).toEqual(before);
    const damaged=await row("student_training_plans",{teacher_id,student_id:learners[0],
      title:"Synthetic invalid goal record",status:"active",goals:[{status:"unknown"}]});
    const unavailable=await read(individual);
    expect(unavailable.status).toBe("ready");
    expect(unavailable.trainingGoals).toEqual({scope:"teacher_wide",status:"unavailable",planned:null,inProgress:null});
    expect((await admin.from("student_training_plans").delete().eq("id",damaged)).error).toBeNull();
    expect((await admin.from("student_training_plans").insert(Array.from({length:100},(_,index)=>({
      teacher_id,student_id:learners[0],title:"Synthetic bounded plan "+index,status:"active",goals:[],
    })))).error).toBeNull();
    const bounded=await read(individual);
    expect(bounded.status).toBe("ready");
    expect(bounded.trainingGoals).toEqual({scope:"teacher_wide",status:"limited",planned:null,inProgress:null});
  }finally{
    for(const id of identities){
      // Canonical plan receipts and revisions use RESTRICT, as do the plans'
      // learner references. Remove only these disposable tenants' fixtures.
      for(const table of ["student_training_plan_receipts","student_training_plan_revisions","student_training_plans"]){
        const cleanup=await admin.from(table).delete().eq("teacher_id",id);
        expect(cleanup.error,table+" fixture cleanup").toBeNull();
      }
      expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});
