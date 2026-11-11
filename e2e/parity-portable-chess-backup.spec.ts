import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-portable-chess-backup-restores-typed-content-homework-goals-and-audit-atomically",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const suffix=randomUUID().slice(0,9);
 const student=(await call("ccp_v1_students_create",{
   name:"Backup learner "+suffix,idempotencyKey:randomUUID(),
 }));
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const materialInput={kind:"game",title:"Teacher backup study "+suffix,
   description:"Own old-game collection",sourceUrl:null,
   details:{pgn:"1. d4 d5 2. c4 *",whitePlayer:"Coach",blackPlayer:"Student",result:"*"},
   requestId:randomUUID()};
 const created=await page.request.post("/api/training/materials",{data:materialInput});
 expect(created.status(),await created.text()).toBe(201);
 const materialId=(await created.json()).material.id as string;
 const assigned=await call("ccp_v1_training_assignments_create",{
   studentIds:[studentId],materialId,
   instructions:"Annotate candidate moves",dueOn:null,
   requestId:randomUUID(),confirmed:true,
 });
 expect(assigned.error).toBeUndefined();
 const assignmentId=assigned.data.assignmentIds[0] as string;
 const goal={id:randomUUID(),title:"Explain c-pawn tension",
   status:"planned",targetDate:null,coachEvidence:null};
 const plan=await call("ccp_v1_training_plans_commit",{
   studentId,title:"Positional training "+suffix,
   summary:"Coach-owned learning objectives",status:"active",
   goals:[goal],requestId:randomUUID(),confirmed:true,
 });
 expect(plan.error).toBeUndefined();
 const planId=plan.data.plan.id as string;

 const response=await page.request.get("/api/settings/export");
 expect(response.status(),await response.text()).toBe(200);
 const backup=await response.json();
 expect(backup.version).toBe(2);
 const only=(table:string,field:string,value:string)=>
   (backup.tables[table] as Array<Record<string,unknown>>)
     .filter(row=>row[field]===value);
 const tables={
   learning_materials:only("learning_materials","id",materialId),
   chess_games:only("chess_games","material_id",materialId),
   training_assignments:only("training_assignments","id",assignmentId),
   student_training_plans:only("student_training_plans","id",planId),
   student_training_plan_revisions:only("student_training_plan_revisions","plan_id",planId),
 };
 for(const [table,rows] of Object.entries(tables))
   expect(rows,table).toHaveLength(1);
 expect(tables.chess_games[0].pgn).toContain("d4");
 expect(tables.student_training_plan_revisions[0].snapshot).toBeDefined();

 const payload={version:backup.version,teacherId:backup.teacherId,
   exportedAt:new Date().toISOString(),tables};
 const websitePreview=await page.request.put("/api/settings/import",{data:{payload}});
 expect(websitePreview.status(),await websitePreview.text()).toBe(200);
 const preview=await websitePreview.json();
 expect(preview.counts).toMatchObject({
   learning_materials:1,chess_games:1,training_assignments:1,
   student_training_plans:1,student_training_plan_revisions:1,
 });
 const mcpPreview=await call("ccp_v1_settings_import_preview",{payload});
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data.sha256).toBe(preview.sha256);
 const apply=await page.request.post("/api/settings/import",{
   data:{payload,expectedSha256:preview.sha256,confirmed:true},
 });
 expect(apply.status(),await apply.text()).toBe(200);
 const accepted=await apply.json();
 expect(accepted.ok).toBe(true);
 expect(accepted.counts.learning_materials).toBe(1);
 expect(accepted.counts.student_training_plan_revisions).toBe(1);

 const replay=await call("ccp_v1_settings_import_apply",{
   payload,expectedSha256:preview.sha256,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data.counts).toEqual(accepted.counts);
 const materialViaMcp=await call("ccp_v1_learning_materials_get",{materialId});
 expect(materialViaMcp.error).toBeUndefined();
 expect(materialViaMcp.data.chess_games.pgn).toBe(materialInput.details.pgn);
 const assignedWeb=await page.request.get("/api/training/assignments?"+
   new URLSearchParams({studentId,limit:"30",offset:"0"}));
 expect(assignedWeb.status(),await assignedWeb.text()).toBe(200);
 expect((await assignedWeb.json()).assignments.some((x:{id:string})=>x.id===assignmentId)).toBe(true);
 const planAudit=await page.request.get("/api/training/plans?"+
   new URLSearchParams({planId}));
 expect(planAudit.status(),await planAudit.text()).toBe(200);
 expect((await planAudit.json()).revisions).toHaveLength(1);

 // An invalid *late* training plan must roll back an earlier catalog edit:
 // website and MCP may not return a partial success for failed restore.
 const originalTitle=tables.learning_materials[0].title;
 const poisonedId=randomUUID();
 const invalidPayload={...payload,exportedAt:new Date().toISOString(),tables:{
   learning_materials:[{...tables.learning_materials[0],
     title:"INVALID UNCOMMITTED overwrite "+suffix}],
   student_training_plans:[{
     id:poisonedId,student_id:randomUUID(),title:"Cannot import foreign student",
     summary:"",status:"draft",goals:[],revision:1,
   }],
 }};
 const badPreview=await page.request.put("/api/settings/import",{data:{payload:invalidPayload}});
 expect(badPreview.status(),await badPreview.text()).toBe(200);
 const digest=(await badPreview.json()).sha256;
 const rejected=await call("ccp_v1_settings_import_apply",{
   payload:invalidPayload,expectedSha256:digest,confirmed:true,
 });
 expect(rejected.error).toBeDefined();
 const materialAfter=await page.request.get("/api/training/materials?id="+materialId);
 expect(materialAfter.status(),await materialAfter.text()).toBe(200);
 expect((await materialAfter.json()).title).toBe(originalTitle);
 const absent=await call("ccp_v1_training_plans_get",{planId:poisonedId});
 expect(absent.error?.code).toBe("NOT_FOUND");
});
