import {describe,it,expect} from "vitest";
import {unzipSync,strFromU8} from "fflate";
import {historicalDatesInputSchema,historicalDatesCommitSchema,toHistoricalFlatRows}
 from "@/lib/server/teacher-historical-attendance-dates";
import {csvTables,tableCsv,makeTeacherCsvZip} from "@/lib/server/teacher-csv-export";
import type {StudioDataExport} from "@/lib/data-transfer";

const studentId="00000000-0000-4000-8000-000000000001";
const workplaceId="00000000-0000-4000-8000-000000000002";
const dateInput={workplaceId,schoolYearStart:"2025-09-01",schoolYearEnd:"2026-08-31",
 timezone:"Asia/Jerusalem",sourceLabel:"2025-26 school register",
 students:[{studentName:"דן כהן",studentId,attendanceDates:["2025-11-03","2026-01-05"]}]};

describe("generic attendance by-date MCP contract",()=>{
 it("exposes source-neutral exact student/date structure and rejects guessed legacy matrix fields",()=>{
  expect(historicalDatesInputSchema.safeParse(dateInput).success).toBe(true);
  expect(historicalDatesInputSchema.safeParse({...dateInput,mapping:{student_name:"Name"}}).success).toBe(false);
  expect(historicalDatesInputSchema.safeParse({...dateInput,students:[
   {studentName:"דן כהן",attendanceDates:["2025-09-01"],V:true}] }).success).toBe(false);
  expect(historicalDatesInputSchema.safeParse({...dateInput,workplaceId:undefined}).success).toBe(false);
 });
 it("uses genuine ISO dates with same workplace for all, preserved source labels",()=>{
  expect(toHistoricalFlatRows(dateInput)).toEqual([
   {"Student Name":"דן כהן","Student ID":studentId,"Workplace ID":workplaceId,
    "Attendance Date":"2025-11-03","Attendance Status":"present",
    "Source Label":"2025-26 school register#student1:date1"},
   {"Student Name":"דן כהן","Student ID":studentId,"Workplace ID":workplaceId,
    "Attendance Date":"2026-01-05","Attendance Status":"present",
    "Source Label":"2025-26 school register#student1:date2"},
  ]);
  expect(historicalDatesInputSchema.safeParse({...dateInput,students:[
   {studentName:"דן כהן",attendanceDates:["05.01.2026"]}]}).success).toBe(false);
 });
 it("bounds observation count, requires reviewed digest and confirmation",()=>{
  expect(historicalDatesInputSchema.safeParse({...dateInput,students:[
   {studentName:"A",attendanceDates:Array.from({length:251},()=>"2026-01-05")}]}).success).toBe(false);
  expect(historicalDatesCommitSchema.safeParse(dateInput).success).toBe(false);
  expect(historicalDatesCommitSchema.safeParse({...dateInput,previewDigest:"a".repeat(64),
   idempotencyKey:studentId,confirmed:true}).success).toBe(true);
 });
});

describe("all-data CSV privacy, schema and portability",()=>{
 const sample:StudioDataExport={exportedAt:"2026-11-17T09:00:00.000Z",
  teacherId:studentId,teacher_profile:{display_name:"Coach"},tables:{
   portal_access_grants:[{id:"grant",contact_id:"person",token_digest:"SECRET-DIGEST"}],
   contacts:[{id:"person",display_name:"מורה",email:"x@y.tld"}],
   students:[{id:"student",name:"=HYPERLINK('http://evil')",notes:{level:"+SUM(1)"}}],
   workplaces:[],
   ccp_historical_attendance_evidence:[{attended_on:"2026-01-05",student_id:"student"}],
   teacher_settings:{stripe_secret_key:null,ai_api_key:"PRIVATE_KEY",currency:"ILS"},
  }};
 it("makes one CSV per table and excludes credential columns while preserving pedagogical data",()=>{
  const tables=csvTables(sample);
  expect(tables.portal_access_grants[0].token_digest).toBeUndefined();
  expect(tables.teacher_settings[0].ai_api_key).toBeUndefined();
  expect(tables.teacher_profile).toEqual([{display_name:"Coach"}]);
  const zip=unzipSync(makeTeacherCsvZip(sample));
  expect(Object.keys(zip)).toEqual(expect.arrayContaining([
   "README.json","portal_access_grants.csv","students.csv","workplaces.csv",
   "ccp_historical_attendance_evidence.csv","teacher_profile.csv"]));
  expect(strFromU8(zip["portal_access_grants.csv"])).not.toContain("SECRET-DIGEST");
  expect(strFromU8(zip["teacher_settings.csv"])).not.toContain("PRIVATE_KEY");
  expect(strFromU8(zip["students.csv"])).toContain("'=HYPERLINK(");
  expect(strFromU8(zip["students.csv"])).toContain('""level""');
  expect(strFromU8(zip["ccp_historical_attendance_evidence.csv"])).toContain("2026-01-05");
 });
 it("preserves complete contact identities in a downloaded owner ZIP but redacts model-visible bulk contacts",()=>{
  const withContacts:StudioDataExport={...sample,tables:{
   ...sample.tables,
   contacts:[{id:"contact-1",display_name:"Club coordinator",
     email:"contact@club.invalid",phone:"+97212345",kind:"person"}],
   student_contacts:[{id:"link-1",student_id:"student",contact_id:"contact-1",
     relationship_label:"Coordinator",is_legal_guardian:false}],
   billing_accounts:[{id:"payer-1",contact_id:"contact-1",
     display_name:"School payer",account_kind:"organization"}],
  }};
  const safe=csvTables(withContacts,{redactContacts:true});
  expect(safe.contacts[0]).not.toHaveProperty("email");
  expect(safe.contacts[0]).not.toHaveProperty("phone");
  expect(safe.contacts[0]).toHaveProperty("display_name","Club coordinator");
  expect(safe.student_contacts).toHaveLength(1);
  expect(safe.billing_accounts).toHaveLength(1);
  const zip=unzipSync(makeTeacherCsvZip(withContacts));
  expect(strFromU8(zip["contacts.csv"])).toContain("contact@club.invalid");
  expect(strFromU8(zip["student_contacts.csv"])).toContain("link-1");
  expect(strFromU8(zip["billing_accounts.csv"])).toContain("payer-1");
 });
 it("quotes multiline/commas and prevents formula injection even with leading whitespace",()=>{
  expect(tableCsv([{first:"  +SUM(1,1)",second:"one,\\ntwo",third:"משה"}]))
   .toContain("'  +SUM");
  expect(tableCsv([{name:"OK"}])).toContain('"name"');
 });
});
