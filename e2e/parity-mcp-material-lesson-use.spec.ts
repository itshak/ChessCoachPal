import {randomUUID} from "node:crypto";
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
