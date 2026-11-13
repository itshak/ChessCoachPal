import {randomInt,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-canonical-slot-delete-preserves-invoice-credit-private-notes keeps frozen financial history on website and MCP deletion replay",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const learner=await tool("ccp_v1_students_create",{
  name:"Financial slot learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const guardian=await tool("ccp_v1_guardians_create",{
  name:"Financial slot payer "+randomUUID(),studentIds:[studentId],confirmed:true,
 });
 expect(guardian.error).toBeUndefined();
 const guardianId=guardian.data.id as string;
 const work=await tool("ccp_v1_workplaces_create",{
  name:"Preserve paid coaching "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(work.error).toBeUndefined();
 const workplaceId=work.data.entityId as string;
 expect((await tool("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const today=Date.parse(new Date().toISOString().slice(0,10)+"T00:00:00Z");
 // Isolate Playwright retries from prior partially written teaching occurrences.
 const dayOffset=randomInt(14,22);
 // The slot materializer only creates upcoming occurrences; vary the time
 // to avoid collisions when Playwright retries after partially writing data.
 const randomMinute=randomInt(360,1080);
 const startTime=String(Math.floor(randomMinute/60)).padStart(2,"0")+":"+String(randomMinute%60).padStart(2,"0");
 const firstDate=new Date(today+dayOffset*86400000).toISOString().slice(0,10);
 const secondDate=new Date(today+(dayOffset+7)*86400000).toISOString().slice(0,10);
 const idempotencyKey=randomUUID();
 const slotInput={
  studentId,workplaceId,dayOfWeek:new Date(firstDate+"T00:00:00Z").getUTCDay(),
  startTime,durationMinutes:60,startDate:firstDate,endDate:secondDate,
  rateCents:7000,isHomeVisit:false,idempotencyKey,
 };
 const created=await page.request.post("/api/coaching/calendar/slots",{data:slotInput});
 expect(created.status(),await created.text()).toBe(200);
 expect(await created.json()).toMatchObject({id:idempotencyKey});
 const mcpReplay=await tool("ccp_v1_recurring_slots_create",{
  ...slotInput,confirmed:true,
 });
 expect(mcpReplay.error).toBeUndefined();
 expect(mcpReplay.data.replayed).toBe(true);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const login=await db.auth.signInWithPassword(SEED_TEACHER);
 expect(login.error).toBeNull();
 const teacherId=login.data.user!.id;
 const sessions=await db.from("teaching_sessions")
  .select("id,slot_id,slot_occurrence_date")
  .eq("teacher_id",teacherId).eq("slot_id",idempotencyKey)
  .order("slot_occurrence_date");
 expect(sessions.error).toBeNull();
 expect(sessions.data).toHaveLength(2);
 const invoiceSession=sessions.data![0].id as string;
 const creditSession=sessions.data![1].id as string;
 const note=await page.request.put(
  "/api/coaching/sessions/"+invoiceSession+"/notes",{data:{
   studentId,body:"Reviewed rook endgames",
   privateBody:"Private notes must remain private after deletion",
   sharedWithGuardian:false,sendEmail:false,
   expectedUpdatedAt:null,idempotencyKey:randomUUID(),
  }});
 expect(note.status(),await note.text()).toBe(200);
 const attendance=await tool("ccp_v1_session_attendance_set",{
  sessionId:creditSession,studentId,status:"present",
  note:"",noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
  idempotencyKey:randomUUID(),notifyFamily:false,confirmed:true,
 });
 expect(attendance.error).toBeUndefined();
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const invoiceA=await admin.from("invoices").insert({
  teacher_id:teacherId,guardian_id:guardianId,period_start:firstDate,
  period_end:firstDate,status:"draft",subtotal_cents:7000,currency:"USD",
 }).select("id").single();
 expect(invoiceA.error).toBeNull();
 const line=await admin.from("invoice_items").insert({
  invoice_id:invoiceA.data!.id,session_id:invoiceSession,student_id:studentId,
  kind:"lesson",description:"Frozen paid teaching occurrence",
  quantity:1,unit_cents:7000,amount_cents:7000,sort_order:0,
 }).select("id").single();
 expect(line.error).toBeNull();
 const invoiceB=await admin.from("invoices").insert({
  teacher_id:teacherId,guardian_id:guardianId,period_start:secondDate,
  period_end:secondDate,status:"sent",subtotal_cents:9000,currency:"USD",
 }).select("id").single();
 expect(invoiceB.error).toBeNull();
 const credits=await admin.from("credit_packages").insert({
  teacher_id:teacherId,student_id:studentId,invoice_id:invoiceB.data!.id,
  credits:2,duration_minutes:60,price_cents:9000,
  starts_on:firstDate,expires_on:null,
 }).select("id").single();
 expect(credits.error).toBeNull();
 const redeemed=await admin.from("credit_redemptions").insert({
  teacher_id:teacherId,package_id:credits.data!.id,
  session_id:creditSession,student_id:studentId,
 }).select("id").single();
 expect(redeemed.error).toBeNull();
 const key=randomUUID();
 const deleted=await tool("ccp_v1_recurring_slots_delete",{
  slotId:idempotencyKey,idempotencyKey:key,confirmed:true,
 });
 expect(deleted.error).toBeUndefined();
 expect(deleted.data).toMatchObject({ok:true});
 expect(deleted.data.preserved).toBeGreaterThanOrEqual(2);
 const browserReplay=await page.request.delete(
  "/api/coaching/calendar/slots/"+idempotencyKey,{
   data:{idempotencyKey:key},
  });
 expect(browserReplay.status(),await browserReplay.text()).toBe(200);
 expect(await browserReplay.json()).toMatchObject({ok:true,replayed:true});
 const stored=await db.from("teaching_sessions")
  .select("id,slot_id,slot_occurrence_date")
  .in("id",[invoiceSession,creditSession]);
 expect(stored.error).toBeNull();
 expect(stored.data).toHaveLength(2);
 expect(stored.data!.every(x=>x.slot_id===null)).toBe(true);
 const remainingLine=await admin.from("invoice_items")
  .select("id,invoice_id,session_id,student_id").eq("id",line.data!.id).single();
 expect(remainingLine.error).toBeNull();
 expect(remainingLine.data).toMatchObject({
  session_id:invoiceSession,student_id:studentId,
  invoice_id:invoiceA.data!.id,
 });
 const remainingCredit=await admin.from("credit_redemptions")
  .select("id,package_id,session_id,student_id").eq("id",redeemed.data!.id).single();
 expect(remainingCredit.error).toBeNull();
 expect(remainingCredit.data).toMatchObject({
  session_id:creditSession,student_id:studentId,
  package_id:credits.data!.id,
 });
 const privateNotes=await tool("ccp_v1_session_notes_list",{
  sessionId:invoiceSession,includePrivate:true,confirmed:true,
 });
 expect(privateNotes.error).toBeUndefined();
 expect(privateNotes.data[0].private_body)
  .toBe("Private notes must remain private after deletion");
 const creditAttendance=await page.request.get(
  "/api/coaching/sessions/"+creditSession+"/attendance");
 expect(creditAttendance.status()).toBe(200);
 expect((await creditAttendance.json())[0].status).toBe("present");
});
