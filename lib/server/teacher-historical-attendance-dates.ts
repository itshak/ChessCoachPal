import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherHistoricalAttendancePreview,teacherHistoricalAttendanceCommit,
  MAX_DIRECT_HISTORICAL_BYTES,MAX_DIRECT_HISTORICAL_ROWS,
} from "@/lib/server/teacher-historical-attendance";
import {historicalFail} from "@/lib/server/teacher-historical-stage";

const uuid=z.string().uuid();
const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,
 "Specify a real calendar date formatted YYYY-MM-DD; never invent dates");
const students=z.array(z.object({
  studentName:z.string().trim().min(1).max(255)
    .describe("Exact name or saved alias from the teacher's roster"),
  studentId:uuid.optional().describe("Optional verified stable student UUID when names are ambiguous"),
  attendanceDates:z.array(isoDate).min(1).max(MAX_DIRECT_HISTORICAL_ROWS)
    .describe("Explicit observed lesson dates, ISO YYYY-MM-DD. No V/X marks, empty cells, totals or invented dates"),
}).strict()).min(1).max(MAX_DIRECT_HISTORICAL_ROWS);
export const historicalDatesInputSchema=z.object({
  workplaceId:uuid.describe("Existing workplace UUID from ccp_workplaces_list, common to all students"),
  schoolYearStart:isoDate.describe("Inclusive source attendance date range start"),
  schoolYearEnd:isoDate.describe("Inclusive source attendance date range end"),
  timezone:z.string().trim().min(1).max(100).describe("Source IANA timezone, for example Asia/Jerusalem"),
  sourceLabel:z.string().trim().min(1).max(120).optional()
    .describe("Teacher-supplied provenance, e.g. Yatmal 2025-26 attendance sheet; no guessed origin"),
  students:students.describe("One entry per pupil, with exact attended dates only"),
}).strict().superRefine((input,ctx)=>{
 const count=input.students.reduce((total,p)=>total+p.attendanceDates.length,0);
 if(count>MAX_DIRECT_HISTORICAL_ROWS)
  ctx.addIssue({code:"custom",path:["students"],
   message:`Maximum ${MAX_DIRECT_HISTORICAL_ROWS} observed dates per reviewed request; split into batches`});
 if(Buffer.byteLength(JSON.stringify(input.students),"utf8")>MAX_DIRECT_HISTORICAL_BYTES)
  ctx.addIssue({code:"custom",path:["students"],message:"Attendance date lists exceed 256 KiB"});
});
export const historicalDatesCommitSchema=historicalDatesInputSchema.safeExtend({
  previewDigest:z.string().regex(/^[a-f0-9]{64}$/)
    .describe("Exact digest obtained from ccp_historical_attendance_dates_preview"),
  idempotencyKey:uuid.describe("New UUID per approved batch; reuse unchanged on retry only"),
  confirmed:z.literal(true).describe("True only after teacher reviews and explicitly approves the preview"),
});
export type HistoricalDatesInput=z.infer<typeof historicalDatesInputSchema>;
export function toHistoricalFlatRows(input:HistoricalDatesInput){
 const rows:Record<string,string>[]=[];
 for(const [studentIndex,student] of input.students.entries()){
  for(const [dateIndex,attendedOn] of student.attendanceDates.entries()){
   rows.push({
    "Student Name":student.studentName,
    "Student ID":student.studentId??"",
    "Workplace ID":input.workplaceId,
    "Attendance Date":attendedOn,
    "Attendance Status":"present",
    "Source Label":`${input.sourceLabel??"verified-attendance-dates"}#student${studentIndex+1}:date${dateIndex+1}`.slice(0,256),
   });
  }
 }
 return rows;
}
function toExistingInput(input:HistoricalDatesInput){
 return {rows:toHistoricalFlatRows(input),schoolYearStart:input.schoolYearStart,
  schoolYearEnd:input.schoolYearEnd,timezone:input.timezone};
}
export async function teacherHistoricalDatesPreview(db:SupabaseClient,teacherId:string,input:unknown){
 const parsed=historicalDatesInputSchema.safeParse(input);
 if(!parsed.success)return historicalFail(400,"VALIDATION_ERROR",
  parsed.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join("; ").slice(0,400));
 const result=await teacherHistoricalAttendancePreview(db,teacherId,toExistingInput(parsed.data));
 return {...result,format:"student-date-lists",
  explanation:"One dated present observation per real input date. Former/archived pupils are supported. This records historical evidence, not calendar sessions or lesson durations."};
}
export async function teacherHistoricalDatesCommit(db:SupabaseClient,teacherId:string,input:unknown){
 const parsed=historicalDatesCommitSchema.safeParse(input);
 if(!parsed.success)return historicalFail(400,"VALIDATION_ERROR",
  parsed.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join("; ").slice(0,400));
 const {previewDigest,idempotencyKey,confirmed,...body}=parsed.data;
 return teacherHistoricalAttendanceCommit(db,teacherId,{
  ...toExistingInput(body),previewDigest,idempotencyKey,confirmed,
 });
}
