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
   guardians:[{id:"parent",name:"מורה",portal_token:"SECRET-PORTAL",email:"x@y.tld"}],
   students:[{id:"student",name:"=HYPERLINK('http://evil')",notes:{level:"+SUM(1)"}}],
   workplaces:[],
   ccp_historical_attendance_evidence:[{attended_on:"2026-01-05",student_id:"student"}],
   studio_policies:{stripe_secret_key:null,ai_api_key:"PRIVATE_KEY",currency:"ILS"},
  }};
 it("makes one CSV per table and excludes credential columns while preserving pedagogical data",()=>{
  const tables=csvTables(sample);
  expect(tables.guardians[0].portal_token).toBeUndefined();
  expect(tables.studio_policies[0].ai_api_key).toBeUndefined();
  expect(tables.teacher_profile).toEqual([{display_name:"Coach"}]);
  const zip=unzipSync(makeTeacherCsvZip(sample));
  expect(Object.keys(zip)).toEqual(expect.arrayContaining([
   "README.json","guardians.csv","students.csv","workplaces.csv",
   "ccp_historical_attendance_evidence.csv","teacher_profile.csv"]));
  expect(strFromU8(zip["guardians.csv"])).not.toContain("SECRET-PORTAL");
  expect(strFromU8(zip["studio_policies.csv"])).not.toContain("PRIVATE_KEY");
  expect(strFromU8(zip["students.csv"])).toContain("'=HYPERLINK(");
  expect(strFromU8(zip["students.csv"])).toContain('""level""');
  expect(strFromU8(zip["ccp_historical_attendance_evidence.csv"])).toContain("2026-01-05");
 });
 it("quotes multiline/commas and prevents formula injection even with leading whitespace",()=>{
  expect(tableCsv([{first:"  +SUM(1,1)",second:"one,\\ntwo",third:"משה"}]))
   .toContain("'  +SUM");
  expect(tableCsv([{name:"OK"}])).toContain('"name"');
 });
});
