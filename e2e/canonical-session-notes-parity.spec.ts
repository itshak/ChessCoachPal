import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: canonical session notes website/MCP share revision, replay and private redaction",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const learner=await tool("ccp_v1_students_create",{
  name:"Canonical note learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const workplace=await tool("ccp_v1_workplaces_create",{
  name:"Notes workplace "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await tool("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const created=await tool("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Private chess coaching",
  startsAt:"2058-05-20T14:00:00Z",durationMinutes:60,
  lessonNote:"Opening principles",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=created.data.entityId as string;
 const base="/api/coaching/sessions/"+sessionId+"/notes";
 const initial=await page.request.get(base);
 expect(initial.status(),await initial.text()).toBe(200);
 expect(await initial.json()).toEqual([]);
 const key=randomUUID();
 const note={studentId,body:"Worked on forks and skewers",
  privateBody:"Needs extra queen-endgame support",
  sharedWithGuardian:false,sendEmail:false,
  expectedUpdatedAt:null,idempotencyKey:key};
 const website=await page.request.put(base,{data:note});
 expect(website.status(),await website.text()).toBe(200);
 const committed=await website.json();
 expect(committed).toMatchObject({sessionId,studentId,emailQueued:false,replayed:false});
 const replay=await tool("ccp_v1_session_notes_save",{
  sessionId,...note,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({
  sessionId,studentId,replayed:true,revision:committed.revision,
 });
 const duplicateChanged=await tool("ccp_v1_session_notes_save",{
  sessionId,...note,body:"Different",confirmed:true,
 });
 expect(duplicateChanged.error?.code).toBe("CONFLICT");
 const read=await tool("ccp_v1_session_notes_list",{
  sessionId,includePrivate:false,
 });
 expect(read.error).toBeUndefined();
 expect(read.data).toHaveLength(1);
 expect(read.data[0].body).toBe(note.body);
 expect(read.data[0]).not.toHaveProperty("private_body");
 const denied=await tool("ccp_v1_session_notes_list",{
  sessionId,includePrivate:true,
 });
 expect(denied.error).toBeDefined();
 const teacher=await tool("ccp_v1_session_notes_list",{
  sessionId,includePrivate:true,confirmed:true,
 });
 expect(teacher.error).toBeUndefined();
 expect(teacher.data[0].private_body).toBe(note.privateBody);
 const stale=await page.request.put(base,{data:{
  ...note,body:"Stale correction",idempotencyKey:randomUUID(),
 }});
 expect(stale.status()).toBe(409);
 const updated=await tool("ccp_v1_session_notes_save",{
  sessionId,...note,body:"Tactics revised",
  expectedUpdatedAt:committed.revision,
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(updated.error).toBeUndefined();
 expect(updated.data.revision).toBeTruthy();
 const after=await page.request.get(base);
 expect(after.status()).toBe(200);
 expect((await after.json())[0].body).toBe("Tactics revised");
 const foreign=await tool("ccp_v1_session_notes_save",{
  sessionId,...note,studentId:randomUUID(),
  expectedUpdatedAt:null,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(foreign.error?.code).toBe("NOT_FOUND");
});
