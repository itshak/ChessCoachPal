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
