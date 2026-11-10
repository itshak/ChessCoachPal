import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {reportCsv,reportText} from "../lib/coaching-report";

type Tool=(name:string,args:Record<string,unknown>)=>Promise<{
  data?:any;error?:{code:string;message:string};
}>;
async function fixture(callTool:Tool,page:import("@playwright/test").Page,date:string){
 const suffix=randomUUID().slice(0,8);
 const made=await callTool("ccp_v1_workplaces_create",{
   name:"Report "+suffix,timezone:"Asia/Jerusalem",currency:"ILS",
   locale:"he",policy:{},idempotencyKey:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 const workplaceId=made.data.entityId as string;
 const group=(await callTool("ccp_v1_groups_create",{
   workplaceId,name:"Report learners "+suffix,idempotencyKey:randomUUID(),
 })).data.entityId as string;
 const participants:string[]=[];
 for(let i=0;i<3;i++){
   const made=(await callTool("ccp_v1_students_create",{
     name:"Report pupil "+suffix+" "+i,idempotencyKey:randomUUID(),
   })).data.entityId as string;
   participants.push(made);
   const joined=await callTool("ccp_v1_groups_enroll",{
     groupId:group,studentId:made,idempotencyKey:randomUUID(),
   });
   expect(joined.error).toBeUndefined();
 }
 const madeSession=await callTool("ccp_v1_sessions_create",{
   workplaceId,groupId:group,title:"Three-student report session",
   startsAt:date+"T10:00:00.000Z",durationMinutes:60,lessonNote:"",
   idempotencyKey:randomUUID(),
 });
 expect(madeSession.error).toBeUndefined();
 const sessionId=madeSession.data.entityId as string;
 for(let i=0;i<2;i++){
   const res=await page.request.post("/api/agent/v1",{data:{
     action:"attendance.record",sessionId,studentId:participants[i],
     status:i===0?"present":"late",note:"Synthetic attendance "+i,
   }});
   expect(res.status(),await res.text()).toBe(200);
 }
 return {workplaceId,participants,sessionId};
}
const read=async(page:import("@playwright/test").Page,wp:string,day:string)=>{
 const r=await page.request.get("/api/coaching/report?"+
   new URLSearchParams({workplaceId:wp,from:day,to:day}));
 expect(r.status(),await r.text()).toBe(200);
 return await r.json();
};
test("PARITY:PARITY-reports-workplace-summary uses same timezone-local calculation",async({page,request})=>{
 const callTool=await delegatedTool(page,request),day="2042-03-04";
 const {workplaceId}=await fixture(callTool,page,day);
 const siteResponse=await page.request.get("/api/coaching/report?"+
   new URLSearchParams({workplaceId,from:day,to:day}));
 expect(siteResponse.status(),await siteResponse.text()).toBe(200);
 const site=await siteResponse.json();
 const mcp=await callTool("ccp_v1_reports_workplace_summary",{
   workplaceId,from:day,to:day,format:"json",
 });
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(site);
 expect(site.report.timezone).toBe("Asia/Jerusalem");
 expect(site.report.locale).toBe("he");
 expect(site.report.sessions).toBe(1);
 expect(site.report.teachingMinutes).toBe(60);
 expect(site.report.participants).toBe(3);
});

test("PARITY:PARITY-reports-group-teacher-minutes counts one teacher hour",async({page,request})=>{
 const callTool=await delegatedTool(page,request),day="2042-03-05";
 const {workplaceId}=await fixture(callTool,page,day);
 const siteResponse=await page.request.get("/api/coaching/report?"+
   new URLSearchParams({workplaceId,from:day,to:day}));
 expect(siteResponse.status(),await siteResponse.text()).toBe(200);
 const site=await siteResponse.json();
 const mcp=await callTool("ccp_v1_reports_workplace_summary",{
   workplaceId,from:day,to:day,
 });
 expect(mcp.error).toBeUndefined();
 expect(mcp.data.report.teachingMinutes).toBe(60);
 expect(mcp.data.report.teachingMinutes).toBe(site.report.teachingMinutes);
 expect(mcp.data.report.participants).toBe(3);
});

test("PARITY:PARITY-reports-attendance-breakdown distinguishes marked and unmarked",async({page,request})=>{
 const callTool=await delegatedTool(page,request),day="2042-03-06";
 const {workplaceId}=await fixture(callTool,page,day);
 const siteResponse=await page.request.get("/api/coaching/report?"+
   new URLSearchParams({workplaceId,from:day,to:day}));
 expect(siteResponse.status(),await siteResponse.text()).toBe(200);
 const site=await siteResponse.json();
 const mcp=await callTool("ccp_v1_reports_workplace_summary",{
   workplaceId,from:day,to:day,
 });
 expect(mcp.error).toBeUndefined();
 expect(mcp.data.report.attendance).toEqual(site.report.attendance);
 expect(mcp.data.report.attendance).toEqual({
   present:1,absent:0,late:1,excused:0,unmarked:1,
 });
});

test("PARITY:PARITY-reports-csv-text export exactly the browser JSON calculation",async({page,request})=>{
 const callTool=await delegatedTool(page,request),day="2042-03-07";
 const {workplaceId}=await fixture(callTool,page,day);
 const siteResponse=await page.request.get("/api/coaching/report?"+
   new URLSearchParams({workplaceId,from:day,to:day}));
 expect(siteResponse.status(),await siteResponse.text()).toBe(200);
 const site=await siteResponse.json();
 const csv=await callTool("ccp_v1_reports_workplace_summary",{
   workplaceId,from:day,to:day,format:"csv",
 });
 const txt=await callTool("ccp_v1_reports_workplace_summary",{
   workplaceId,from:day,to:day,format:"text",
 });
 expect(csv.error).toBeUndefined();
 expect(txt.error).toBeUndefined();
 expect(csv.data.report).toEqual(site.report);
 expect(txt.data.report).toEqual(site.report);
 expect(csv.data.export).toBe(reportCsv(site.report));
 expect(txt.data.export).toBe(reportText(site.report));
 expect(csv.data.export).toContain("Teaching minutes");
 expect(csv.data.export).not.toContain("Report pupil");
});

test("PARITY:PARITY-reports-ranges rejects invalid range and foreign workplace",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const made=await callTool("ccp_v1_workplaces_create",{
   name:"Restricted report "+randomUUID().slice(0,9),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 const workplaceId=made.data.entityId as string;
 const site=await page.request.get("/api/coaching/report?"+
   new URLSearchParams({workplaceId,from:"2042-02-21",to:"2042-02-20"}));
 expect(site.status()).toBe(400);
 const mcp=await callTool("ccp_v1_reports_workplace_summary",{
   workplaceId,from:"2042-02-21",to:"2042-02-20",
 });
 expect(mcp.error?.code).toBe("VALIDATION_ERROR");
 const other=await page.request.get("/api/coaching/report?"+
   new URLSearchParams({
     workplaceId:"00000000-0000-4000-8000-000000000001",
     from:"2042-02-20",to:"2042-02-21",
   }));
 expect(other.status()).toBe(404);
 const otherMcp=await callTool("ccp_v1_reports_workplace_summary",{
   workplaceId:"00000000-0000-4000-8000-000000000001",
   from:"2042-02-20",to:"2042-02-21",
 });
 expect(otherMcp.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-reports-hebrew-timezone-csv-safety honors local midnight and excludes formula-like names",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const name='=HYPERLINK("https://attacker.invalid","משפחת שחמט") '+randomUUID();
 const workplace=await callTool("ccp_v1_workplaces_create",{
   name,timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",
   policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const created=await callTool("ccp_v1_students_create",{
   name:"רבקה כהן "+randomUUID().slice(0,8),idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const studentId=created.data.entityId as string;
 const enrolled=await callTool("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
 });
 expect(enrolled.error).toBeUndefined();
 // At this date Jerusalem is UTC+3: 22:30 UTC belongs to the following local
 // day, and a session 24h later must not be counted in that first local day.
 for(const startsAt of ["2042-06-17T22:30:00.000Z","2042-06-18T22:30:00.000Z"]){
   const session=await callTool("ccp_v1_sessions_create",{
     workplaceId,studentId,title:"שיעור שחמט",startsAt,
     durationMinutes:45,lessonNote:"Teacher observation",
     idempotencyKey:randomUUID(),
   });
   expect(session.error).toBeUndefined();
 }
 const from="2042-06-18",to="2042-06-18";
 const browser=await page.request.get("/api/coaching/report?"+
   new URLSearchParams({workplaceId,from,to}));
 expect(browser.status(),await browser.text()).toBe(200);
 const site=await browser.json();
 expect(site.workplace.name).toBe(name);
 expect(site.report.timezone).toBe("Asia/Jerusalem");
 expect(site.report.locale).toBe("he");
 expect(site.report.sessions).toBe(1);
 expect(site.report.teachingMinutes).toBe(45);
 const report=await callTool("ccp_v1_reports_workplace_summary",{
   workplaceId,from,to,format:"json",
 });
 expect(report.error).toBeUndefined();
 expect(report.data).toEqual(site);
 const csv=await callTool("ccp_v1_reports_workplace_summary",{
   workplaceId,from,to,format:"csv",
 });
 expect(csv.error).toBeUndefined();
 expect(csv.data.report).toEqual(site.report);
 expect(csv.data.export).toBe(reportCsv(site.report));
 expect(csv.data.export).toMatch(/^\uFEFF"Metric","Value"/);
 expect(csv.data.export).not.toContain("=HYPERLINK");
 expect(csv.data.export).not.toContain("רבקה כהן");
});
