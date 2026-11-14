import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

type Tool=Awaited<ReturnType<typeof delegatedTool>>;
async function preparedStudent(tool:Tool,workplaceId:string) {
 const result=await tool("ccp_v1_students_create",{
  name:"Canonical independent parity pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(result.error).toBeUndefined();
 const studentId=result.data.entityId as string;
 const enroll=await tool("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 });
 expect(enroll.error).toBeUndefined();
 return studentId;
}
async function workplace(tool:Tool) {
 const result=await tool("ccp_v1_workplaces_create",{
  name:"Attendance independent proof "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(result.error).toBeUndefined();
 return result.data.entityId as string;
}
const a=(studentId:string,status:"present"|"late"|"absent"|null,
 expectedUpdatedAt:string|null)=>({
 studentId,status,note:"",noticeAt:null,cancelReason:"",
 expectedUpdatedAt,notifyFamily:false,confirmed:true,
});

test("PARITY:PARITY-canonical-attendance-single-revision-cross-client accepts a receipt once and rejects changed replay",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const workplaceId=await workplace(tool),studentId=await preparedStudent(tool,workplaceId);
 const created=await tool("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Individual revision check",
  startsAt:"2092-06-19T10:00:00Z",durationMinutes:45,
  lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=created.data.entityId as string;
 const url="/api/coaching/sessions/"+sessionId+"/attendance";
 const key=randomUUID();
 const input={...a(studentId,"present",null),idempotencyKey:key};
 const first=await page.request.put(url,{data:input});
 expect(first.status(),await first.text()).toBe(200);
 const receipt=await first.json();
 expect(receipt).toMatchObject({status:"present",replayed:false,studentId});
 expect(typeof receipt.revision).toBe("string");
 const sameKey=await tool("ccp_v1_session_attendance_set",{
  sessionId,...input,
 });
 expect(sameKey.error).toBeUndefined();
 expect(sameKey.data).toMatchObject({replayed:true,revision:receipt.revision});
 const changedPayload=await tool("ccp_v1_session_attendance_set",{
  sessionId,...input,status:"late",
 });
 expect(changedPayload.error?.code).toBe("CONFLICT");
 const stale=await page.request.put(url,{data:{
  ...a(studentId,"late",null),idempotencyKey:randomUUID(),
 }});
 expect(stale.status(),await stale.text()).toBe(409);
 const changed=await tool("ccp_v1_session_attendance_set",{
  sessionId,...a(studentId,"late",receipt.revision),idempotencyKey:randomUUID(),
 });
 expect(changed.error).toBeUndefined();
 expect(changed.data.status).toBe("late");
 const browser=await page.request.get(url);
 expect(browser.status()).toBe(200);
 const rows=await browser.json();
 expect(rows).toHaveLength(1);
 expect(rows[0].status).toBe("late");
 expect(rows[0].updatedAt).toBe(changed.data.revision);
 const cleared=await page.request.put(url,{data:{
  ...a(studentId,null,changed.data.revision),idempotencyKey:randomUUID(),
 }});
 expect(cleared.status(),await cleared.text()).toBe(200);
 expect(await cleared.json()).toMatchObject({cleared:true});
 const mcpRead=await tool("ccp_v1_session_attendance_list",{sessionId});
 expect(mcpRead.error).toBeUndefined();
 expect(mcpRead.data).toHaveLength(1);
 expect(mcpRead.data[0].status).toBe("unmarked");
});

test("PARITY:PARITY-canonical-attendance-bulk-child-rollback-and-replay refuses one stale participant without partial writes",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const workplaceId=await workplace(tool);
 const students=[await preparedStudent(tool,workplaceId),await preparedStudent(tool,workplaceId)];
 const group=await tool("ccp_v1_groups_create",{
  workplaceId,name:"Bulk rollback group "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(group.error).toBeUndefined();
 for(const studentId of students) {
  const added=await tool("ccp_v1_groups_enroll",{
   groupId:group.data.entityId,studentId,idempotencyKey:randomUUID(),
  });
  expect(added.error).toBeUndefined();
 }
 const created=await tool("ccp_v1_sessions_create",{
  workplaceId,groupId:group.data.entityId,title:"Independent bulk rollback",
  startsAt:"2093-07-19T12:00:00Z",durationMinutes:60,
  lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=created.data.entityId as string;
 const url="/api/coaching/sessions/"+sessionId+"/attendance";
 const first=await tool("ccp_v1_session_attendance_set",{
  sessionId,...a(students[0],"present",null),idempotencyKey:randomUUID(),
 });
 expect(first.error).toBeUndefined();
 const invalidRows=[a(students[0],"late",null),a(students[1],"absent",null)];
 const refused=await page.request.post(url,{data:{
  attendance:invalidRows,idempotencyKey:randomUUID(),
 }});
 expect(refused.status(),await refused.text()).toBe(409);
 const untouched=await tool("ccp_v1_session_attendance_list",{sessionId});
 expect(untouched.error).toBeUndefined();
 expect(untouched.data.find((x:{studentId:string})=>x.studentId===students[0]).status).toBe("present");
 expect(untouched.data.find((x:{studentId:string})=>x.studentId===students[1]).status).toBe("unmarked");
 const rows=[a(students[0],"late",first.data.revision),a(students[1],"absent",null)];
 const key=randomUUID();
 const approved=await page.request.post(url,{data:{
  attendance:rows,idempotencyKey:key,
 }});
 expect(approved.status(),await approved.text()).toBe(200);
 const receipt=await approved.json();
 expect(receipt).toMatchObject({count:2,replayed:false});
 const replay=await tool("ccp_v1_session_attendance_bulk_set",{
  sessionId,attendance:rows,idempotencyKey:key,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({count:2,replayed:true});
 const changed=await tool("ccp_v1_session_attendance_bulk_set",{
  sessionId,attendance:[a(students[0],"absent",first.data.revision),rows[1]],
  idempotencyKey:key,confirmed:true,
 });
 expect(changed.error?.code).toBe("CONFLICT");
 const actual=await page.request.get(url);
 expect(actual.status()).toBe(200);
 expect((await actual.json()).map((x:{status:string})=>x.status).sort())
  .toEqual(["absent","late"]);
});
