import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-progress-student-summary unifies strength, skill history and attested materials",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const created=await call("ccp_v1_students_create",{
   name:"Progress learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const studentId=created.data.entityId as string;
 const edited=await page.request.put("/api/students/"+studentId,{
   data:{strength:7,level:"Tactical intermediate",
     lichessUsername:"progressplayer",lichessRating:1700},
 });
 expect(edited.status(),await edited.text()).toBe(200);
 const dimension=await call("ccp_v1_skill_dimensions_create",{
   name:"Student tactics "+randomUUID(),confirmed:true,
 });
 expect(dimension.error).toBeUndefined();
 const dimensionId=dimension.data.id as string;
 const assessment=await call("ccp_v1_student_skill_assessments_record",{
   studentId,ratings:[{dimensionId,rating:4,note:"Synthetic tactical review"}],
   confirmed:true,
 });
 expect(assessment.error).toBeUndefined();
 const resource=await call("ccp_v1_chess_resources_link",{
   studentId,label:"Rook workbook "+randomUUID(),
   url:"https://lichess.org/study/AbCd1234",
   resourceType:"lichess_study",requestId:randomUUID(),
 });
 expect(resource.error).toBeUndefined();
 const history=await call("ccp_v1_materials_history_record",{
   studentId,resourceId:resource.data.id,stage:"taught",
   occurredOn:"2042-04-20",note:"Teacher confirms lesson",
   requestId:randomUUID(),confirmed:true,
 });
 expect(history.error).toBeUndefined();
 const browser=await page.request.get("/api/coaching/student-progress?studentId="+studentId);
 expect(browser.status(),await browser.text()).toBe(200);
 const site=await browser.json();
 const mcp=await call("ccp_v1_reports_student_progress",{studentId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(site);
 expect(site.student.strength).toBe(7);
 expect(site.student.lichessRating).toBe(1700);
 expect(site.student.teacher_notes).toBeUndefined();
 const tactics=site.skills.find((x:{dimensionId:string})=>x.dimensionId===dimensionId);
 expect(tactics.latestRating).toBe(4);
 expect(tactics.observations).toBe(1);
 expect(site.materials.evidenceClaims).toBe(1);
 expect(site.materials.stages.taught).toBe(1);
 expect(site.truthBasis).toBe("teacher_attested_only");
 const foreignId="00000000-0000-4000-8000-000000000001";
 const denied=await call("ccp_v1_reports_student_progress",{studentId:foreignId});
 expect(denied.error?.code).toBe("NOT_FOUND");
 const websiteDenied=await page.request.get("/api/coaching/student-progress?studentId="+foreignId);
 expect(websiteDenied.status()).toBe(404);
});
