import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-student-training-plans-goal-history keeps explicit coach decisions identical across web and delegated MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const marker=randomUUID().slice(0,10);
 const createdStudent=await call("ccp_v1_students_create",{
   name:"Plan learner "+marker,idempotencyKey:randomUUID(),
 });
 expect(createdStudent.error).toBeUndefined();
 const studentId=createdStudent.data.entityId as string;
 const goal={id:randomUUID(),title:"Hold rook endgame opposition",
   status:"planned",targetDate:null,coachEvidence:null};
 const draft={studentId,title:"Endgame recovery "+marker,
   summary:"Coach-led opposition and basic rook technique",
   status:"active",goals:[goal],requestId:randomUUID(),confirmed:true};
 const createdWeb=await page.request.post("/api/training/plans",{data:draft});
 expect(createdWeb.status(),await createdWeb.text()).toBe(200);
 const created=await createdWeb.json();
 const planId=created.receipt.planId as string;
 expect(created.receipt).toMatchObject({revision:1,replayed:false});
 expect(created.plan.student_id).toBe(studentId);
 expect(created.plan.goals).toHaveLength(1);
 const initialMcp=await call("ccp_v1_training_plans_list",{studentId,limit:30,offset:0});
 expect(initialMcp.error).toBeUndefined();
 const listWeb=await page.request.get("/api/training/plans?"+
   new URLSearchParams({studentId,limit:"30",offset:"0"}));
 expect(listWeb.status(),await listWeb.text()).toBe(200);
 expect(initialMcp.data).toEqual(await listWeb.json());
 expect(initialMcp.data.truthBasis).toBe("explicit_teacher_goal_decisions_only");
 const one=await call("ccp_v1_training_plans_get",{planId});
 expect(one.error).toBeUndefined();
 expect(one.data.plan.id).toBe(planId);
 expect(one.data.revisions).toHaveLength(1);
 expect(one.data.revisions[0].snapshot.goals[0].status).toBe("planned");
 const webOne=await page.request.get("/api/training/plans?"+
   new URLSearchParams({planId}));
 expect(webOne.status(),await webOne.text()).toBe(200);
 expect(one.data).toEqual(await webOne.json());

 // Neither interface can infer mastery from a checked-off task.
 const invalid={...draft,planId,expectedRevision:1,status:"completed",
   goals:[{...goal,status:"achieved",coachEvidence:""}],
   requestId:randomUUID()};
 const rejectedWeb=await page.request.post("/api/training/plans",{data:invalid});
 expect(rejectedWeb.status()).toBe(400);
 const rejectedMcp=await call("ccp_v1_training_plans_commit",invalid);
 expect(rejectedMcp.error?.code).toBe("VALIDATION_ERROR");
 const incomplete=await call("ccp_v1_training_plans_commit",{
   ...invalid,goals:[goal],requestId:randomUUID(),
 });
 expect(incomplete.error?.code).toBe("VALIDATION_ERROR");

 const evidenced={...draft,planId,expectedRevision:1,status:"completed",
   goals:[{...goal,status:"achieved",
      coachEvidence:"Coach reviewed an annotated king-and-rook opposition exercise in class."}],
   requestId:randomUUID()};
 const modelChange=await call("ccp_v1_training_plans_commit",evidenced);
 expect(modelChange.error).toBeUndefined();
 expect(modelChange.data.receipt).toMatchObject({revision:2,replayed:false});
 const sameWeb=await page.request.post("/api/training/plans",{data:evidenced});
 expect(sameWeb.status(),await sameWeb.text()).toBe(200);
 expect((await sameWeb.json()).receipt.replayed).toBe(true);
 const conflicting=await call("ccp_v1_training_plans_commit",{
   ...evidenced,title:"Changed request under same UUID",
 });
 expect(conflicting.error?.code).toBe("IDEMPOTENCY_CONFLICT");
 const stale=await call("ccp_v1_training_plans_commit",{
   ...evidenced,requestId:randomUUID(),
 });
 expect(stale.error?.code).toBe("STALE_REVISION");

 const audited=await page.request.get("/api/training/plans?"+
   new URLSearchParams({planId}));
 expect(audited.status(),await audited.text()).toBe(200);
 const auditedPlan=await audited.json();
 expect(auditedPlan.revisions.map((x:{revision:number})=>x.revision)).toEqual([2,1]);
 expect(auditedPlan.revisions[0].snapshot.goals[0].status).toBe("achieved");
 expect(auditedPlan.revisions[1].snapshot.goals[0].status).toBe("planned");

 const modelBriefing=await call("ccp_v1_coach_briefing_get",{studentId,limit:20});
 expect(modelBriefing.error).toBeUndefined();
 const websiteBriefing=await page.request.get("/api/coaching/briefing?"+
   new URLSearchParams({studentId,limit:"20"}));
 expect(websiteBriefing.status(),await websiteBriefing.text()).toBe(200);
 expect(modelBriefing.data).toEqual(await websiteBriefing.json());
 const planInBriefing=modelBriefing.data.trainingPlans.entries.find(
   (x:{id:string})=>x.id===planId);
 expect(planInBriefing.goals[0].status).toBe("achieved");
 expect(modelBriefing.data.basis).toBe("stored_teacher_owned_records_no_inferred_mastery");

 const archive={...evidenced,planId,expectedRevision:2,status:"archived",
   requestId:randomUUID()};
 const archivedWeb=await page.request.post("/api/training/plans",{data:archive});
 expect(archivedWeb.status(),await archivedWeb.text()).toBe(200);
 const unarchivedList=await call("ccp_v1_training_plans_list",{studentId,limit:30,offset:0});
 expect(unarchivedList.data.plans.some((x:{id:string})=>x.id===planId)).toBe(false);
 const allPlans=await call("ccp_v1_training_plans_list",{
   studentId,includeArchived:true,limit:30,offset:0,
 });
 expect(allPlans.data.plans.find((x:{id:string})=>x.id===planId).status).toBe("archived");
 const unknown=await call("ccp_v1_training_plans_get",{planId:randomUUID()});
 expect(unknown.error?.code).toBe("NOT_FOUND");
});
