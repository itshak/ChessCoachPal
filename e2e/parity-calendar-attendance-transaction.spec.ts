import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-calendar-attendance-atomic-replay enforces cross-client revision, replay and tenant scoping",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const learner=await call("ccp_v1_students_create",{
  name:"Calendar commit learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const day=new Date(Date.UTC(2055,0,1)+
  (Number.parseInt(randomUUID().slice(0,8),16)%365)*86400000).toISOString().slice(0,10);
 const lesson=await call("ccp_v1_calendar_lessons_create",{
  studentId,date:day,time:"14:00",durationMinutes:45,confirmed:true,
 });
 expect(lesson.error).toBeUndefined();
 const lessonId=lesson.data.id as string;
 const read=()=>page.request.get("/api/schedule/lessons/"+lessonId+"/attendance");
 const initial=await read();
 expect(initial.status(),await initial.text()).toBe(200);
 expect(await initial.json()).toBeNull();

 const key=randomUUID();
 const payload={status:"attended" as const,cancelNote:"",
  notifyFamily:false,expectedMarkedAt:null,idempotencyKey:key};
 const website=await page.request.put(
  "/api/schedule/lessons/"+lessonId+"/attendance",{data:payload});
 expect(website.status(),await website.text()).toBe(200);
 const committed=await website.json();
 expect(committed.status).toBe("attended");
 expect(committed.replayed).toBe(false);
 const replay=await call("ccp_v1_calendar_attendance_record",{
  lessonId,...payload,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data.status).toBe("attended");
 expect(replay.data.replayed).toBe(true);
 expect(replay.data.marked_at).toBe(committed.marked_at);
 const changed=await call("ccp_v1_calendar_attendance_record",{
  lessonId,...payload,status:"no_show",confirmed:true,
 });
 expect(changed.error?.code).toBe("CONFLICT");
 const stale=await call("ccp_v1_calendar_attendance_record",{
  lessonId,...payload,idempotencyKey:randomUUID(),status:"no_show",confirmed:true,
 });
 expect(stale.error?.code).toBe("CONFLICT");

 const corrected=await call("ccp_v1_calendar_attendance_record",{
  lessonId,status:"no_show",cancelNote:"Absent",
  expectedMarkedAt:committed.marked_at,
  idempotencyKey:randomUUID(),notifyFamily:false,confirmed:true,
 });
 expect(corrected.error).toBeUndefined();
 const after=await read();
 expect(after.status(),await after.text()).toBe(200);
 const updated=await after.json();
 expect(updated.status).toBe("no_show");
 expect(updated.cancel_note).toBe("Absent");

 const cleared=await page.request.put("/api/schedule/lessons/"+lessonId+"/attendance",{
  data:{status:null,expectedMarkedAt:updated.marked_at,
   idempotencyKey:randomUUID(),notifyFamily:false},
 });
 expect(cleared.status(),await cleared.text()).toBe(200);
 expect((await cleared.json()).cleared).toBe(true);
 const empty=await call("ccp_v1_calendar_attendance_read",{lessonId});
 expect(empty.error).toBeUndefined();
 expect(empty.data).toBeNull();

 const foreign=await call("ccp_v1_calendar_attendance_record",{
  lessonId:randomUUID(),status:"attended",expectedMarkedAt:null,
  idempotencyKey:randomUUID(),notifyFamily:false,confirmed:true,
 });
 expect(foreign.error?.code).toBe("NOT_FOUND");
});
