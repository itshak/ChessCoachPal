import {createHash,randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-mcp-material-lesson-use typed material and student-specific evidence atomic website/MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const tag=randomUUID().slice(0,8);
 const club=await call("ccp_workplaces_create",{
  name:"Material use "+tag,timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",
  policy:{},idempotencyKey:randomUUID(),
 });
 expect(club.error).toBeUndefined();
 const workplaceId=club.data.entityId as string;
 const studentIds:string[]=[];
 for(const name of ["Daniel "+tag,"Michael "+tag]){
  const pupil=await call("ccp_students_create",{name,idempotencyKey:randomUUID()});
  expect(pupil.error).toBeUndefined();
  studentIds.push(pupil.data.entityId);
  expect((await call("ccp_workplaces_enroll",{
   workplaceId,studentId:pupil.data.entityId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 }
 const lesson=await call("ccp_lessons_capture_completed",{
  workplaceId,studentIds,title:"Material endgame "+tag,
  startsAt:"2046-03-01T09:00:00+02:00",
  durationMinutes:90,lessonNote:"Lucena, one pupil was absent",
  attendance:[
   {studentId:studentIds[0],status:"present",note:"Daniel studied the endgame"},
   {studentId:studentIds[1],status:"absent",note:"Michael missed this lesson"},
  ],requestId:randomUUID(),confirmed:true,
 });
 expect(lesson.error).toBeUndefined();
 const sessionId=lesson.data.sessionId as string;
 const material={kind:"drill",title:"Lucena practice "+tag,description:"",
  sourceUrl:null,details:{instructions:"Practice the Lucena position",
    mode:"endgame",repetitions:null},requestId:randomUUID()};
 const requestBody={sessionId,material:{create:material},occurredOn:"2046-03-01",
  studentEvidence:[{studentId:studentIds[0],stage:"taught",note:"Daniel worked through Lucena"}]};
 const webPreview=await page.request.post("/api/coaching/materials/lesson-use",{data:requestBody});
 expect(webPreview.status(),await webPreview.text()).toBe(200);
 const preview=await webPreview.json();
 expect(preview.canCommit).toBe(true);
 expect(preview.noWrites).toBe(true);
 const mcpPreview=await call("ccp_materials_lesson_use_preview",requestBody);
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data).toEqual(preview);
 const payload={...preview.proposedCommit,requestId:randomUUID(),confirmed:true};
 const committed=await call("ccp_materials_lesson_use_commit",payload);
 expect(committed.error).toBeUndefined();
 expect(committed.data).toMatchObject({sessionId,oneTransaction:true,
  newMaterialCreated:true,evidenceCount:1,inferredMastery:false,replayed:false});
 const materialId=committed.data.materialId as string;
 const replay=await page.request.put("/api/coaching/materials/lesson-use",{data:payload});
 expect(replay.status(),await replay.text()).toBe(200);
 expect(await replay.json()).toMatchObject({...committed.data,replayed:true});
 const links=await call("ccp_material_links_list",{sessionId});
 expect(links.error).toBeUndefined();
 expect(JSON.stringify(links.data)).toContain(materialId);
 const history=await call("ccp_materials_history_list",{sessionId});
 expect(history.error).toBeUndefined();
 expect(history.data.total).toBe(1);
 expect(history.data.entries[0]).toMatchObject({
  student_id:studentIds[0],material_id:materialId,stage:"taught",
  note:"Daniel worked through Lucena",
 });
 const created=await call("ccp_learning_materials_get",{materialId});
 expect(created.error).toBeUndefined();
 expect(created.data.kind).toBe("drill");
 const changed=await call("ccp_materials_lesson_use_commit",{
  ...payload,studentEvidence:[{...payload.studentEvidence[0],note:"Changed replay"}],
 });
 expect(changed.error?.code).toBe("CONFLICT");
 const absent={...requestBody,material:{existingMaterialId:materialId},
  studentEvidence:[{studentId:studentIds[1],stage:"taught",note:"Not actually taught"}]};
 const blocked=await call("ccp_materials_lesson_use_preview",absent);
 expect(blocked.error).toBeUndefined();
 expect(blocked.data.canCommit).toBe(false);
 expect(blocked.data.issues).toContain("NO_ATTESTED_PRESENCE_FOR_TAUGHT_OR_COMPLETED");
 const denied=await call("ccp_materials_lesson_use_commit",{
  ...absent,expectedSessionUpdatedAt:preview.session.updated_at,
  requestId:randomUUID(),confirmed:true,
 });
 expect(denied.error?.code).toBe("CONFLICT");
 const after=await call("ccp_materials_history_list",{sessionId});
 expect(after.data.total).toBe(1);

 // Existing-material reuse is a first-class choice; do not silently create
 // a second resource because the teacher referenced a known catalog ID.
 const secondLesson=await call("ccp_lessons_capture_completed",{
  workplaceId,studentIds,title:"Existing material use "+tag,
  startsAt:"2046-03-02T09:00:00+02:00",durationMinutes:90,
  lessonNote:"Second reviewed session",
  attendance:[
   {studentId:studentIds[0],status:"present",note:"Daniel present"},
   {studentId:studentIds[1],status:"present",note:"Michael present"},
  ],requestId:randomUUID(),confirmed:true,
 });
 expect(secondLesson.error).toBeUndefined();
 const secondSessionId=secondLesson.data.sessionId as string;
 const reusePreview=await call("ccp_materials_lesson_use_preview",{
  sessionId:secondSessionId,material:{existingMaterialId:materialId},
  occurredOn:"2046-03-02",studentEvidence:[
   {studentId:studentIds[1],stage:"taught",note:"Explicitly revisited this known drill"},
  ],
 });
 expect(reusePreview.error).toBeUndefined();
 expect(reusePreview.data.canCommit).toBe(true);
 const reused=await call("ccp_materials_lesson_use_commit",{
  ...reusePreview.data.proposedCommit,requestId:randomUUID(),confirmed:true,
 });
 expect(reused.error).toBeUndefined();
 expect(reused.data).toMatchObject({materialId,newMaterialCreated:false,
  sessionId:secondSessionId,evidenceCount:1,oneTransaction:true});

 // Force a failure LATE inside the SQL transaction: seed a valid UUID that
 // collides with the composite's deterministic child material-evidence key.
 // The first catalog insertion and session link MUST then roll back as well.
 let rollbackKey="",collisionId="";
 for(let i=0;i<128;i++){
  const candidate=randomUUID();
  const digest=createHash("md5").update(candidate+":student-evidence:1").digest("hex");
  if(!/[1-8]/.test(digest[12])||!/[89ab]/.test(digest[16]))continue;
  rollbackKey=candidate;
  collisionId=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),
    digest.slice(16,20),digest.slice(20)].join("-");
  break;
 }
 expect(rollbackKey).not.toBe("");
 const seeded=await call("ccp_materials_history_record",{
  studentId:studentIds[0],materialId,sessionId:secondSessionId,
  workplaceId,stage:"assigned",occurredOn:"2046-03-02",
  note:"Existing unrelated attestation must survive",
  requestId:collisionId,confirmed:true,
 });
 expect(seeded.error).toBeUndefined();
 const rollbackMaterial={...material,title:"Rollback root "+tag,requestId:randomUUID()};
 const rollbackPreview=await call("ccp_materials_lesson_use_preview",{
  sessionId:secondSessionId,material:{create:rollbackMaterial},
  occurredOn:"2046-03-02",studentEvidence:[
   {studentId:studentIds[0],stage:"taught",note:"Intentional child-unique conflict"},
  ],
 });
 expect(rollbackPreview.error).toBeUndefined();
 expect(rollbackPreview.data.canCommit).toBe(true);
 const rejected=await call("ccp_materials_lesson_use_commit",{
  ...rollbackPreview.data.proposedCommit,requestId:rollbackKey,confirmed:true,
 });
 expect(rejected.error?.code).toBe("CONFLICT");
 const catalogAfter=await call("ccp_learning_materials_list",{
  kind:"drill",query:rollbackMaterial.title,limit:100,
 });
 expect(catalogAfter.error).toBeUndefined();
 expect(catalogAfter.data.materials).toHaveLength(0);
 const linksAfter=await call("ccp_material_links_list",{sessionId:secondSessionId});
 expect(linksAfter.error).toBeUndefined();
 expect(JSON.stringify(linksAfter.data)).not.toContain(rollbackMaterial.title);
 const historyAfter=await call("ccp_materials_history_list",{sessionId:secondSessionId});
 expect(historyAfter.error).toBeUndefined();
 expect(historyAfter.data.total).toBe(2);
 expect(historyAfter.data.entries.some((e:{note:string})=>
  e.note==="Existing unrelated attestation must survive")).toBe(true);
});

test("PARITY:PARITY-mcp-material-lesson-use-invalid rejects invalid source and duplicate participant claims",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=randomUUID(),sessionId=randomUUID(),materialId=randomUUID();
 const invalid={sessionId,material:{existingMaterialId:materialId},occurredOn:"2046-02-31",
  studentEvidence:[{studentId,stage:"taught"}]};
 const web=await page.request.post("/api/coaching/materials/lesson-use",{data:invalid});
 expect(web.status()).toBe(400);
 const mcp=await call("ccp_materials_lesson_use_preview",invalid);
 expect(mcp.error?.code).toBe("VALIDATION_ERROR");
 const duplicate=await call("ccp_materials_lesson_use_preview",{
  ...invalid,occurredOn:"2046-02-05",
  studentEvidence:[{studentId,stage:"assigned"},{studentId,stage:"taught"}],
 });
 expect(duplicate.error?.code).toBe("VALIDATION_ERROR");
});
