import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {addDays,toLocalDateString} from "../lib/schedule";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";

const origin=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;
test("PARITY: portal grant authority follows the current inclusive teacher-local period and retains allowed past notes",async({page,request,playwright,isolatedTeacher})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const owner=await admin.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
 expect(owner.error).toBeNull();
 const teacherId=owner.data!.id as string;
 const teacherZone="Etc/GMT+12",venueZone="Pacific/Kiritimati";
 const now=new Date();
 const teacherToday=toLocalDateString(now,teacherZone),venueToday=toLocalDateString(now,venueZone);
 expect(venueToday>teacherToday).toBe(true);
 const policy=async(timezone:string)=>{
  const {error}=await admin.from("teacher_settings").upsert({teacher_id:teacherId,timezone});
  expect(error).toBeNull();
 };
 await policy(teacherZone);
 const learner=await call("ccp_students_create",{name:"Dated portal pupil "+randomUUID(),idempotencyKey:randomUUID()});
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const venue=async(name:string)=>{
  const res=await call("ccp_workplaces_create",{name,timezone:venueZone,currency:"USD",
   locale:"en",policy:{},idempotencyKey:randomUUID()});
  expect(res.error).toBeUndefined();
  return res.data.entityId as string;
 };
 const reopened=await venue("Reopened school "+randomUUID());
 const ended=await venue("Ended school "+randomUUID());
 const cancelled=await venue("Cancelled school "+randomUUID());
 const future=await venue("Future school "+randomUUID());
 const past=addDays(teacherToday,-8),yesterday=addDays(teacherToday,-1);
 const rows=[
  {workplace_id:reopened,starts_on:past,ends_on:yesterday},
  {workplace_id:reopened,starts_on:teacherToday,ends_on:teacherToday},
  {workplace_id:ended,starts_on:past,ends_on:yesterday},
  {workplace_id:cancelled,starts_on:teacherToday,ends_on:teacherToday,
   cancelled_at:now.toISOString(),cancel_reason:"Synthetic cancelled-only fixture"},
  {workplace_id:future,starts_on:venueToday,ends_on:null},
 ].map(row=>({...row,teacher_id:teacherId,student_id:studentId}));
 // Disposable dated fixtures are explicit; no clock or SQL rule is replaced.
 expect((await admin.from("workplace_enrollments").insert(rows)).error).toBeNull();
 const session=await call("ccp_sessions_create",{workplaceId:reopened,studentId,
  title:"Previously held chess lesson",startsAt:new Date(now.getTime()-3*86400000).toISOString(),
  durationMinutes:45,idempotencyKey:randomUUID()});
 expect(session.error).toBeUndefined();
 const historicalNote="Approved school history "+randomUUID(),privateNote="Private history "+randomUUID();
 const saved=await call("ccp_session_notes_save",{
  sessionId:session.data.entityId,studentId,body:historicalNote,privateBody:privateNote,
  sharedWithContacts:true,sendEmail:false,expectedUpdatedAt:null,idempotencyKey:randomUUID(),
  confirmed:true,
 });
 expect(saved.error).toBeUndefined();
 const contact=await call("ccp_contacts_create",{displayName:"Dated school contact",
  idempotencyKey:randomUUID(),confirmed:true});
 expect(contact.error).toBeUndefined();
 const contactId=contact.data.id as string;
 expect((await call("ccp_student_contacts_link",{studentId,contactId,relationshipLabel:"School contact",
  idempotencyKey:randomUUID(),confirmed:true})).error).toBeUndefined();
 const args=(workplaceId:string)=>({studentId,contactId,workplaceId,permissions:["calendar","shared_notes"],
  expiresAt:new Date(now.getTime()+2*86400000).toISOString(),idempotencyKey:randomUUID(),confirmed:true});
 for(const workplaceId of [ended,cancelled,future]){
  const rejected=await call("ccp_portal_grants_create",args(workplaceId));
  expect(rejected.error?.code).toBe("NOT_ENROLLED");
  const browser=await page.request.post("/api/portal-grants",{headers:{origin},data:args(workplaceId)});
  expect(browser.status()).toBe(409);
  expect((await browser.json()).error).toBe("NOT_ENROLLED");
 }
 const queued=await call("ccp_portal_grants_create",args(reopened));
 expect(queued.error).toBeUndefined();
 const grantId=queued.data.id as string;
 const issue=()=>page.request.post("/api/portal-grants/"+grantId+"/issue",
  {headers:{origin},data:{expectedRevision:1,confirmed:true}});
 const issued=await issue();
 expect(issued.status(),await issued.text()).toBe(200);
 const url=new URL((await issued.json()).url).pathname;
 const guest=await playwright.request.newContext({baseURL:origin});
 try{
  const first=await guest.get(url);
  expect(first.status()).toBe(200);
  const html=await first.text();
  expect(html).toContain(historicalNote);
  expect(html).not.toContain(privateNote);
  const calendarPath="/api"+url+"/calendar";
  expect((await guest.get(calendarPath)).status()).toBe(200);
  // A scope that is no longer current may not rotate its token or access
  // old resources. Preserve the original issued revision for teacher review.
  await policy(venueZone);
  const changed=await guest.get(url);
  expect(await changed.text()).not.toContain(historicalNote);
  expect((await guest.get(calendarPath)).status()).toBe(404);
  const rotation=await page.request.post("/api/portal-grants/"+grantId+"/issue",
   {headers:{origin},data:{expectedRevision:2,confirmed:true}});
  expect(rotation.status()).toBe(409);
  expect((await rotation.json()).error).toBe("SCOPE_INACTIVE");
  const metadata=await call("ccp_portal_grants_get",{grantId});
  expect(metadata.error).toBeUndefined();
  expect(metadata.data).toMatchObject({revision:2,revokedAt:null,issued:true});
  const revoked=await call("ccp_portal_grants_revoke",{grantId,expectedRevision:2,
   idempotencyKey:randomUUID(),confirmed:true});
  expect(revoked.error).toBeUndefined();
  expect((await call("ccp_portal_grants_get",{grantId})).data).toMatchObject({revision:3,issued:false});
 }finally{await guest.dispose();}
});
