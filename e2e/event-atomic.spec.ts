import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

test("event creation rolls back the master record when late roster update fails",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="atomic-event-"+randomUUID()+"@example.com";
 const password="SyntheticEventRollback-123!";
 const {data:identity,error:createError}=await admin.auth.admin.createUser({
   email,password,email_confirm:true,
 });
 expect(createError).toBeNull();
 const teacherId=identity.user!.id;
 try{
   expect((await admin.from("teachers").insert({
     id:teacherId,email,display_name:"Event rollback test",hosted_enforced:false,
   })).error).toBeNull();
   const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
     auth:{persistSession:false,autoRefreshToken:false},
   });
   expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
   const {data:student,error:studentError}=await auth.from("students")
     .insert({teacher_id:teacherId,name:"Event rollback student"})
     .select("id").single();
   expect(studentError).toBeNull();
   const title="Must roll back "+randomUUID();
   const failed=await auth.rpc("ccp_teacher_event_save",{
     p_event_id:null,
     p_fields:{title,starts_at:"2027-08-12T11:00:00+02:00"},
     p_student_ids:[student!.id],
     p_repertoire:{[student!.id]:10}, // Invalid type after event insertion
   });
   expect(failed.error).not.toBeNull();
   const events=await auth.from("events").select("id").eq("title",title);
   expect(events.error).toBeNull();
   expect(events.data).toEqual([]);
 }finally{
   await admin.auth.admin.deleteUser(teacherId);
 }
});
test("PARITY:PARITY-events-transaction-roundtrip preserves RSVP roster across website/MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const made=await call("ccp_v1_students_create",{
   name:"Atomic event pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 const studentId=made.data.entityId as string;
 const title="Atomic workshop "+randomUUID();
 const created=await call("ccp_v1_events_create",{
   title,startsAt:"2027-05-01T10:00:00+03:00",
   studentIds:[studentId],confirmed:true,
 });
 expect(created.error).toBeUndefined();
 const id=created.data.event.id as string;
 const web=await page.request.get("/api/events/"+id);
 expect(web.status(),await web.text()).toBe(200);
 expect((await web.json()).event.students.map((s:{studentId:string})=>s.studentId))
   .toEqual([studentId]);
 // Website must be able to edit one student's learning repertoire without
 // replacing the event roster; MCP reads the exact same persisted value.
 const webRepertoire=await page.request.put("/api/events/"+id,{data:{
   repertoireByStudent:{[studentId]:"Coach reviewed rook endgame"},
 }});
 expect(webRepertoire.status(),await webRepertoire.text()).toBe(200);
 const afterWeb=await call("ccp_v1_events_detail",{eventId:id});
 expect(afterWeb.error).toBeUndefined();
 expect(afterWeb.data.event.students).toMatchObject([{
   studentId,repertoire:"Coach reviewed rook endgame",
 }]);
 // MCP can then correct that same field without sending studentIds.
 const modelRepertoire=await call("ccp_v1_events_update",{
   eventId:id,repertoireByStudent:{[studentId]:"Knight forks reviewed"},
   confirmed:true,
 });
 expect(modelRepertoire.error).toBeUndefined();
 const afterModel=await page.request.get("/api/events/"+id);
 expect(afterModel.status(),await afterModel.text()).toBe(200);
 expect((await afterModel.json()).event.students[0].repertoire)
   .toBe("Knight forks reviewed");
 // Re-submitting the same roster with no repertoire payload must not clear
 // existing teaching notes or rewrite the student's RSVP history.
 const preserve=await page.request.put("/api/events/"+id,{data:{
   studentIds:[studentId],title:title+" preserved",
 }});
 expect(preserve.status(),await preserve.text()).toBe(200);
 const preserved=await call("ccp_v1_events_detail",{eventId:id});
 expect(preserved.data.event.students[0].repertoire).toBe("Knight forks reviewed");
 // An unknown student ID must reject atomically, not silently discard notes.
 const unknown=await page.request.put("/api/events/"+id,{data:{
   repertoireByStudent:{[randomUUID()]:"Must not be recorded"},
 }});
 expect(unknown.status(),await unknown.text()).toBe(400);
 const unchanged=await call("ccp_v1_events_detail",{eventId:id});
 expect(unchanged.data.event.students[0].repertoire).toBe("Knight forks reviewed");
 const edited=await page.request.put("/api/events/"+id,{data:{
   title:title+" reviewed",studentIds:[],
 }});
 expect(edited.status(),await edited.text()).toBe(200);
 const model=await call("ccp_v1_events_detail",{eventId:id});
 expect(model.error).toBeUndefined();
 expect(model.data.event.title).toBe(title+" reviewed");
 expect(model.data.event.students).toEqual([]);
});


test("PARITY:PARITY-event-cross-client-idempotency rejects conflicting retries and writes one event",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const key=randomUUID();
 const title="One event per reviewed request "+randomUUID();
 const start="2027-10-09T14:00:00+03:00";
 const created=await call("ccp_v1_events_create",{
   title,startsAt:start,idempotencyKey:key,confirmed:true,
 });
 expect(created.error).toBeUndefined();
 const id=created.data.event.id as string;

 const webRetry=await page.request.post("/api/events",{data:{
   title,startsAt:start,idempotencyKey:key,
 }});
 expect(webRetry.status(),await webRetry.text()).toBe(201);
 expect((await webRetry.json()).event.id).toBe(id);

 const browserList=await page.request.get("/api/events");
 expect(browserList.status(),await browserList.text()).toBe(200);
 expect((await browserList.json()).events.filter(
   (e:{title:string})=>e.title===title)).toHaveLength(1);

 const changed=await page.request.post("/api/events",{data:{
   title:title+" conflicting",startsAt:start,idempotencyKey:key,
 }});
 expect(changed.status(),await changed.text()).toBe(409);

 const updateKey=randomUUID();
 const browserUpdate=await page.request.put("/api/events/"+id,{data:{
   location:"Reviewed club venue",idempotencyKey:updateKey,
 }});
 expect(browserUpdate.status(),await browserUpdate.text()).toBe(200);
 const modelRetry=await call("ccp_v1_events_update",{
   eventId:id,location:"Reviewed club venue",idempotencyKey:updateKey,
   confirmed:true,
 });
 expect(modelRetry.error).toBeUndefined();
 const after=(await (await page.request.get("/api/events/"+id)).json()).event;
 expect(after.location).toBe("Reviewed club venue");
 const updateConflict=await call("ccp_v1_events_update",{
   eventId:id,location:"Different venue",idempotencyKey:updateKey,
   confirmed:true,
 });
 expect(updateConflict.error?.code).toBe("IDEMPOTENCY_CONFLICT");
 const final=(await (await page.request.get("/api/events/"+id)).json()).event;
 expect(final.location).toBe("Reviewed club venue");
});


test("PARITY:PARITY-event-shared-field-validation rejects unknown fields and malformed input on both surfaces",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const title="Event schema parity "+randomUUID();
 const date="2027-11-10T11:00:00+02:00";
 const unknownWeb=await page.request.post("/api/events",{data:{
   title,startsAt:date,secretUnexpected:"cannot mutate",
 }});
 expect(unknownWeb.status(),await unknownWeb.text()).toBe(400);
 const unknownMcp=await call("ccp_v1_events_create",{
   title,startsAt:date,secretUnexpected:"cannot mutate",confirmed:true,
 });
 expect(unknownMcp.error?.code).toBe("VALIDATION_ERROR");
 const invalidWeb=await page.request.post("/api/events",{data:{
   title,startsAt:"not-a-date",
 }});
 expect(invalidWeb.status(),await invalidWeb.text()).toBe(400);
 const invalidMcp=await call("ccp_v1_events_create",{
   title,startsAt:"not-a-date",confirmed:true,
 });
 expect(invalidMcp.error?.code).toBe("VALIDATION_ERROR");
 const good=await page.request.post("/api/events",{data:{
   title,startsAt:date,idempotencyKey:randomUUID(),
 }});
 expect(good.status(),await good.text()).toBe(201);
 const eventId=(await good.json()).event.id as string;
 const invalidEdit=await page.request.put("/api/events/"+eventId,{data:{
   location:"Cannot write",invalidDomainField:"ignored previously",
 }});
 expect(invalidEdit.status(),await invalidEdit.text()).toBe(400);
 const mcpInvalidEdit=await call("ccp_v1_events_update",{
   eventId,location:"Cannot write",invalidDomainField:"ignored previously",confirmed:true,
 });
 expect(mcpInvalidEdit.error?.code).toBe("VALIDATION_ERROR");
 expect((await (await page.request.get("/api/events/"+eventId)).json()).event.location)
  .not.toBe("Cannot write");
});
