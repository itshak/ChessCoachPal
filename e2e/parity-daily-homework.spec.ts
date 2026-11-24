import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-daily-homework due-through review uses current evidence in All only",async({page,request})=>{
  test.setTimeout(120_000);
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const identities:string[]=[];
  const password="SyntheticHomeworkReview456!";
  async function tenant(){
    const email="daily-homework-"+randomUUID()+"@example.invalid";
    const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});
    expect(auth.error).toBeNull();
    const id=auth.data.user!.id;
    identities.push(id);
    expect((await admin.from("teachers").insert({id,email,display_name:"Daily homework fixture",
      preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
    await configureSyntheticStudentCapacity(admin,id,8,4);
    return {id,email};
  }
  async function row(table:string,value:Record<string,unknown>){
    const result=await admin.from(table).insert(value).select("id").single();
    expect(result.error,table).toBeNull();
    return result.data!.id as string;
  }
  try{
    const owner=await tenant(),foreign=await tenant(),teacher_id=owner.id;
    const venue=(teacher_id:string,name:string)=>row("workplaces",{
      teacher_id,name,timezone:"UTC",locale:"en",currency:"USD",kind:"professional",policy:{},
    });
    const school=await venue(teacher_id,"Homework School"), club=await venue(teacher_id,"Homework Club");
    const outside=await venue(foreign.id,"Foreign homework venue");
    const student=await row("students",{teacher_id,name:"Private fixture learner"});
    const foreignStudent=await row("students",{teacher_id:foreign.id,name:"Outside private fixture learner"});
    for(const workplace_id of [school,club])
      expect((await admin.from("workplace_enrollments").insert({
        teacher_id,workplace_id,student_id:student,source:"manual",
      })).error).toBeNull();
    const tool=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
    const material=await tool("ccp_learning_materials_create",{
      kind:"external_link",title:"Review fixture chess resource",sourceUrl:"https://example.invalid/study",
      description:"Private material description",details:{},requestId:randomUUID(),
    });
    expect(material.error).toBeUndefined();
    const materialId=material.data.material.id as string;
    const date="2026-08-01";
    const assign=async(dueOn:string|null)=>{
      const result=await tool("ccp_training_assignments_create",{
        studentIds:[student],materialId,instructions:"Private fixture instructions",dueOn,
        requestId:randomUUID(),confirmed:true,
      });
      expect(result.error).toBeUndefined();
      return result.data.assignmentIds[0] as string;
    };
    const due=await assign("2026-07-27"), waiting=await assign("2026-07-28");
    const needs=await assign("2026-07-29"), reviewed=await assign("2026-07-30");
    const again=await assign("2026-07-31");
    await assign("2026-08-02");
    await assign(null);
    const attempt=async(assignmentId:string,outcome:"submitted"|"completed"|"in_progress")=>{
      const result=await tool("ccp_training_attempt_record",{
        assignmentId,outcome,note:"Private fixture attempt",requestId:randomUUID(),confirmed:true,
      });
      expect(result.error).toBeUndefined();
      return result.data.attemptId as string;
    };
    const review=async(assignmentId:string,attemptId:string|null,verdict:"reviewed"|"needs_work")=>{
      const result=await tool("ccp_training_review_record",{
        assignmentId,attemptId,verdict,feedback:"Private fixture review",requestId:randomUUID(),confirmed:true,
      });
      expect(result.error).toBeUndefined();
    };
    await attempt(due,"in_progress");
    await attempt(waiting,"submitted");
    await review(needs,await attempt(needs,"completed"),"needs_work");
    await attempt(reviewed,"submitted");
    await review(reviewed,null,"reviewed");
    await review(again,await attempt(again,"submitted"),"reviewed");
    await attempt(again,"submitted");
    const foreignMaterial=await row("learning_materials",{
      teacher_id:foreign.id,title:"Foreign homework must never appear",kind:"external_link",
      source_url:"https://example.invalid/foreign",request_id:randomUUID(),request_hash:"synthetic-foreign-material",
    });
    const seed=(teacher_id:string,student_id:string,material_id:string,due_on:string)=>({
      teacher_id,student_id,material_id,due_on,batch_request_id:randomUUID(),request_hash:"synthetic-daily-fixture",
    });
    const foreignId=await row("training_assignments",seed(foreign.id,foreignStudent,foreignMaterial,"2026-07-01"));
    const archivedStudent=await row("students",{teacher_id,name:"Archived fixture learner"});
    const archivedAssignment=await row("training_assignments",seed(teacher_id,archivedStudent,materialId,"2026-07-01"));
    const archivePreview=await tool("ccp_students_lifecycle_preview",{studentId:archivedStudent});
    expect(archivePreview.error).toBeUndefined();
    const archive=await tool("ccp_students_lifecycle_commit",{
      studentId:archivedStudent,mode:"archive",expectedUpdatedAt:archivePreview.data.expectedUpdatedAt,
      selectedWorkplaceIds:[],requestId:randomUUID(),reason:"Keep inactive homework out of current action queue",confirmed:true,
    });
    expect(archive.error).toBeUndefined();
    const ties=await admin.from("training_assignments").insert(Array.from({length:25},()=>
      seed(teacher_id,student,materialId,date))).select("id");
    expect(ties.error).toBeNull();
    const tieIds=ties.data!.map(row=>row.id as string).sort();
    const snapshot=async()=>{
      const results=await Promise.all([
        admin.from("training_assignments").select("id,updated_at").eq("teacher_id",teacher_id).order("id"),
        admin.from("assignment_attempts").select("id,recorded_at").eq("teacher_id",teacher_id).order("id"),
        admin.from("assignment_reviews").select("id,reviewed_at").eq("teacher_id",teacher_id).order("id"),
      ]);
      expect(results.map(result=>result.error)).toEqual([null,null,null]);
      return results.map(result=>result.data);
    };
    const before=await snapshot();
    const api="/api/dashboard/summary";
    const read=async(workplaceId:string|null|undefined,homeworkAfter?:string)=>{
      const params=new URLSearchParams({date});
      if(workplaceId!==undefined)params.set("workplaceId",workplaceId??"all");
      if(homeworkAfter)params.set("homeworkAfter",homeworkAfter);
      const response=await page.request.get(api+"?"+params);
      expect(response.status(),await response.text()).toBe(200);
      const web=await response.json();
      const mcp=await tool("ccp_dashboard_summary",{date,
        ...(workplaceId!==undefined?{workplaceId}:{}),...(homeworkAfter?{homeworkAfter}:{}),
      });
      expect(mcp.error).toBeUndefined();
      expect(mcp.data).toEqual(web);
      return web.daily.homework;
    };
    expect(await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:school,expectedSelectedWorkplaceId:null,confirmed:true,
    })).toMatchObject({data:{selectedWorkplaceId:school}});
    expect(await read(undefined)).toEqual({status:"workplace_scope_unavailable"});
    expect(await read(club)).toEqual({status:"workplace_scope_unavailable"});
    expect((await page.request.get(api+"?date="+date+"&workplaceId="+outside)).status()).toBe(404);
    expect((await tool("ccp_dashboard_summary",{date,workplaceId:outside})).error?.code).toBe("WORKPLACE_NOT_FOUND");
    await page.goto("/dashboard?date="+date);
    const region=page.getByRole("region",{name:"Homework to review"});
    await expect(region.getByText("Select All workplaces",{exact:false})).toBeVisible();
    await expect(region.getByRole("listitem")).toHaveCount(0);
    const first=await read(null);
    expect(first).toMatchObject({status:"ready",evidence:"current",dueThrough:date,limit:24});
    expect(first.assignments.slice(0,4).map((x:{assignmentId:string;reason:string})=>[x.assignmentId,x.reason]))
      .toEqual([[due,"DUE_AWAITING_SUBMISSION"],[waiting,"SUBMISSION_AWAITING_REVIEW"],
        [needs,"REVIEW_NEEDS_WORK"],[again,"SUBMISSION_AWAITING_REVIEW"]]);
    expect(first.assignments.slice(4).map((x:{assignmentId:string})=>x.assignmentId)).toEqual(tieIds.slice(0,19));
    expect(first.nextAfter).toBe(date+"~"+date+"~"+tieIds[18]);
    const next=await read(null,first.nextAfter);
    expect(next.assignments.map((x:{assignmentId:string})=>x.assignmentId)).toEqual(tieIds.slice(19));
    expect(next.nextAfter).toBeNull();
    expect((await page.request.get(api+"?date=2026-08-02&homeworkAfter="+encodeURIComponent(first.nextAfter))).status()).toBe(400);
    const bytes=JSON.stringify([first,next]);
    for(const excluded of [student,foreignId,reviewed,archivedAssignment,"Private fixture","Foreign homework","source_url","mastery"])
      expect(bytes).not.toContain(excluded);
    expect(await tool("ccp_workplace_context_set",{
      selectedWorkplaceId:null,expectedSelectedWorkplaceId:school,confirmed:true,
    })).toMatchObject({data:{selectedWorkplaceId:null}});
    await page.goto("/dashboard?date="+date);
    await expect(region.getByText("Due through "+date,{exact:false})).toBeVisible();
    await expect(region.getByText("Latest review says work is needed")).toBeVisible();
    await region.getByRole("link",{name:"Check the next homework window"}).click();
    await expect(region.getByRole("listitem")).toHaveCount(6);
    expect(await snapshot()).toEqual(before);
  }finally{
    for(const id of identities) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
