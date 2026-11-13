import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: canonical make-up credits are frozen participant-scoped, listed by web and MCP, and consumed once",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const student=await tool("ccp_v1_students_create",{
  name:"Makeup pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const workplace=await tool("ccp_v1_workplaces_create",{
  name:"Makeup group "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await tool("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const sourceDate=new Date(Date.UTC(2074,0,1)+
   (Number.parseInt(randomUUID().slice(0,8),16)%300)*86400000)
   .toISOString().slice(0,10);
 const source=await tool("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Cancelled private class",
  startsAt:sourceDate+"T14:00:00.000Z",durationMinutes:45,
  lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(source.error).toBeUndefined();
 const sourceSessionId=source.data.entityId as string;
 const teacherCancel=await tool("ccp_v1_session_attendance_set",{
  sessionId:sourceSessionId,studentId,status:"teacher_cancelled",
  note:"Teacher absence",cancelReason:"Teacher sick",noticeAt:null,
  expectedUpdatedAt:null,idempotencyKey:randomUUID(),
  notifyFamily:false,confirmed:true,
 });
 expect(teacherCancel.error).toBeUndefined();
 const web=await page.request.get("/api/coaching/calendar/makeup-credits");
 expect(web.status(),await web.text()).toBe(200);
 const webRows=(await web.json()).credits as Array<Record<string,unknown>>;
 const mcp=await tool("ccp_v1_canonical_makeup_credits_list",{});
 expect(mcp.error).toBeUndefined();
 const webOwned=webRows.filter(x=>x.studentId===studentId&&x.sourceSessionId===sourceSessionId);
 const mcpOwned=(mcp.data.credits as Array<Record<string,unknown>>)
  .filter(x=>x.studentId===studentId&&x.sourceSessionId===sourceSessionId);
 expect(webOwned).toEqual(mcpOwned);
 expect(webOwned).toHaveLength(1);
 expect(webOwned[0]).toMatchObject({
  studentId,sourceSessionId,status:"teacher_cancelled",durationMinutes:45,
 });
 const makeupDate=new Date(Date.parse(sourceDate+"T00:00:00.000Z")+86400000)
  .toISOString().slice(0,10);
 const key=randomUUID();
 const input={studentId,workplaceId,date:makeupDate,time:"16:00",
  makeupForSessionId:sourceSessionId,durationMinutes:45,
  isHomeVisit:false,idempotencyKey:key};
 const create=await page.request.post("/api/coaching/calendar/private-sessions",{
  data:input,
 });
 expect(create.status(),await create.text()).toBe(200);
 const receipt=await create.json();
 expect(receipt).toMatchObject({student_id:studentId,makeup_for_session_id:sourceSessionId});
 const replay=await tool("ccp_v1_private_sessions_create",{...input,confirmed:true});
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({id:receipt.id,replayed:true});
 const after=await page.request.get("/api/coaching/calendar/makeup-credits");
 expect(after.status(),await after.text()).toBe(200);
 expect((await after.json()).credits.filter((x:{studentId:string})=>x.studentId===studentId))
  .toHaveLength(0);
 const duplicate=await page.request.post("/api/coaching/calendar/private-sessions",{
  data:{...input,idempotencyKey:randomUUID()},
 });
 expect(duplicate.status(),await duplicate.text()).toBe(409);
});
