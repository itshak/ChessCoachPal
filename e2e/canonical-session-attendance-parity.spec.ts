import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-canonical-attendance-bulk canonical session attendance set, clear and atomic bulk website/MCP replay and revision",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const workplace=await call("ccp_v1_workplaces_create",{
  name:"Canonical attendance "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const studentIds:string[]=[];
 for(let n=0;n<2;n++){
  const created=await call("ccp_v1_students_create",{
   name:"Canonical attendee "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(created.error).toBeUndefined();
  const studentId=created.data.entityId as string;
  studentIds.push(studentId);
  const enroll=await call("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
  });
  expect(enroll.error).toBeUndefined();
 }
 const group=await call("ccp_v1_groups_create",{
  workplaceId,name:"Attendance group "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(group.error).toBeUndefined();
 const groupId=group.data.entityId as string;
 for(const studentId of studentIds)
  expect((await call("ccp_v1_groups_enroll",{
   groupId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 const created=await call("ccp_v1_sessions_create",{
  workplaceId,groupId,title:"Endgame study",
  startsAt:new Date(Date.UTC(2059,0,1)+
   (Number.parseInt(randomUUID().slice(0,8),16)%150)*86400000).toISOString(),
  durationMinutes:60,lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const id=created.data.entityId as string;
 const url="/api/coaching/sessions/"+id+"/attendance";
 const first=await page.request.get(url);
 expect(first.status(),await first.text()).toBe(200);
 const initial=await first.json();
 expect(initial).toHaveLength(2);
 expect(initial.every((r:{status:string;updatedAt:string|null})=>
  r.status==="unmarked"&&r.updatedAt===null)).toBe(true);
 const person=studentIds[0],key=randomUUID();
 const input={studentId:person,status:"present",note:"Good tactics",
   noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
   idempotencyKey:key,notifyFamily:false,confirmed:true};
 const website=await page.request.put(url,{data:input});
 expect(website.status(),await website.text()).toBe(200);
 const receipt=await website.json();
 expect(receipt).toMatchObject({sessionId:id,studentId:person,
  status:"present",replayed:false,cleared:false});
 const replay=await call("ccp_v1_session_attendance_set",{
  sessionId:id,...input,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({replayed:true,revision:receipt.revision});
 const stale=await call("ccp_v1_session_attendance_set",{
  sessionId:id,...input,status:"late",idempotencyKey:randomUUID(),
 });
 expect(stale.error?.code).toBe("CONFLICT");
 const bulk={
  idempotencyKey:randomUUID(),
  attendance:[
   {studentId:person,status:"late" as const,note:"Late arrival",
    noticeAt:null,cancelReason:"",expectedUpdatedAt:receipt.revision,
    notifyFamily:false,confirmed:true},
   {studentId:studentIds[1],status:"absent" as const,note:"School trip",
    noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
    notifyFamily:false,confirmed:true},
  ],
  confirmed:true,
 };
 const webBulk=await page.request.post(url,{data:bulk});
 expect(webBulk.status(),await webBulk.text()).toBe(200);
 const batch=await webBulk.json();
 expect(batch).toMatchObject({count:2,replayed:false});
 const mcpBulk=await call("ccp_v1_session_attendance_bulk_set",{
  sessionId:id,...bulk,
 });
 expect(mcpBulk.error).toBeUndefined();
 expect(mcpBulk.data).toMatchObject({count:2,replayed:true});
 const register=await call("ccp_v1_session_attendance_list",{sessionId:id});
 expect(register.error).toBeUndefined();
 expect(register.data.map((x:{status:string})=>x.status).sort()).toEqual(["absent","late"]);
 const rev=register.data.find((x:{studentId:string})=>x.studentId===person).updatedAt;
 const clear=await page.request.put(url,{data:{
  ...input,status:null,note:"",expectedUpdatedAt:rev,
  idempotencyKey:randomUUID(),
 }});
 expect(clear.status(),await clear.text()).toBe(200);
 expect(await clear.json()).toMatchObject({cleared:true});
 const now=await page.request.get(url);
 expect(now.status()).toBe(200);
 expect((await now.json()).find((x:{studentId:string})=>
  x.studentId===person).status).toBe("unmarked");
 const outsider=await call("ccp_v1_session_attendance_set",{
  sessionId:id,...input,studentId:randomUUID(),
  idempotencyKey:randomUUID(),
 });
 expect(outsider.error?.code).toBe("NOT_FOUND");
});
