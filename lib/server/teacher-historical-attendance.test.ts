import {describe,it,expect} from "vitest";
import {suggestHistoricalMapping,historicalInputSchema,
 historicalCommitSchema,historicalReportSchema,MAX_DIRECT_HISTORICAL_ROWS,MAX_DIRECT_HISTORICAL_BYTES}
 from "@/lib/server/teacher-historical-attendance";
import {bulkLifecyclePreviewSchema,bulkLifecycleCommitSchema}
 from "@/lib/server/teacher-bulk-lifecycle";

describe("strict historical spreadsheet field mapping",()=>{
 it("maps explicit dates, attendance and aggregate periods",()=>{
  const mapped=suggestHistoricalMapping([
   "Student Name","Workplace","Date","Attendance",
   "Period Start","Period End","Lesson Count","Source timezone",
  ]);
  expect(mapped).toEqual({
   studentName:"Student Name",workplaceName:"Workplace",
   attendedOn:"Date",attendanceStatus:"Attendance",
   periodStart:"Period Start",periodEnd:"Period End",
   lessonCount:"Lesson Count",sourceTimezone:"Source timezone",
  });
 });
 it("preserves recognized Hebrew and Russian source headers but never suggests one of multiple matches",()=>{
  expect(suggestHistoricalMapping([" שם תלמיד ","Место работы","Дата урока","נוכחות","Attendance"]))
   .toEqual({studentName:" שם תלמיד ",workplaceName:"Место работы",attendedOn:"Дата урока"});
 });
 it("does not guess undefined date, period or student alias",()=>{
  expect(suggestHistoricalMapping(["Something","Another"])).toEqual({});
 });
 it("rejects conversational raw overlimit rows, ambiguous both-stage-and-rows, missing year",()=>{
  const base={schoolYearStart:"2024-09-01",schoolYearEnd:"2026-07-01",
   timezone:"Asia/Jerusalem"};
  expect(historicalInputSchema.safeParse({...base,stageId:"00000000-0000-4000-8000-000000000002"}).success).toBe(true);
  expect(historicalInputSchema.safeParse({...base,rows:[{"Student Name":"pupil"}]}).success).toBe(true);
  expect(historicalInputSchema.safeParse({...base,stageId:"00000000-0000-4000-8000-000000000002",
   rows:[{"Student Name":"pupil"}]}).success).toBe(false);
  const sample={"Student Name":"test","Workplace":"School","Date":"2026-03-12","Attendance":"present"};
  expect(MAX_DIRECT_HISTORICAL_ROWS).toBe(250);
  expect(historicalInputSchema.safeParse({...base,rows:Array.from({length:167},()=>sample)}).success).toBe(true);
  expect(historicalInputSchema.safeParse({...base,rows:Array.from({length:250},()=>sample)}).success).toBe(true);
  expect(historicalInputSchema.safeParse({...base,rows:Array.from({length:251},()=>sample)}).success).toBe(false);
  const oversized=[{"Source note":"x".repeat(MAX_DIRECT_HISTORICAL_BYTES)}];
  expect(historicalInputSchema.safeParse({...base,rows:oversized}).success).toBe(false);
  expect(historicalCommitSchema.safeParse({...base,rows:oversized,
   previewDigest:"a".repeat(64),idempotencyKey:"00000000-0000-4000-8000-000000000002",confirmed:true}).success).toBe(false);
  expect(historicalInputSchema.safeParse({rows:[{name:"X"}]}).success).toBe(false);
 });
 it("requires review digest and explicit write approval",()=>{
  const base={schoolYearStart:"2024-09-01",schoolYearEnd:"2026-07-01",
   timezone:"Asia/Jerusalem",rows:[{name:"Historical pupil"}],
   previewDigest:"a".repeat(64),idempotencyKey:"00000000-0000-4000-8000-000000000002"};
  expect(historicalCommitSchema.safeParse({...base}).success).toBe(false);
  expect(historicalCommitSchema.safeParse({...base,confirmed:true}).success).toBe(true);
  expect(historicalReportSchema.safeParse({limit:201}).success).toBe(false);
 });
});
describe("reviewed bulk archive/reactivation",()=>{
 const row={studentId:"00000000-0000-4000-8000-000000000002",archived:true,
  expectedUpdatedAt:"2026-11-16T12:00:00Z"};
 it("requires stable student IDs, archive boolean and bounded batch",()=>{
  expect(bulkLifecyclePreviewSchema.safeParse({rows:[row]}).success).toBe(true);
  expect(bulkLifecyclePreviewSchema.safeParse({rows:[]}).success).toBe(false);
  expect(bulkLifecyclePreviewSchema.safeParse({rows:[{...row,archived:"true"}]}).success).toBe(false);
  expect(bulkLifecyclePreviewSchema.safeParse({rows:[{...row,unexpected:"yes"}]}).success).toBe(false);
  expect(bulkLifecyclePreviewSchema.safeParse({rows:Array.from({length:101},()=>row)}).success).toBe(false);
 });
 it("requires preview digest, durable receipt UUID and explicit confirmation",()=>{
  const body={rows:[row],previewDigest:"a".repeat(64),
    idempotencyKey:"00000000-0000-4000-8000-000000000002"};
  expect(bulkLifecycleCommitSchema.safeParse(body).success).toBe(false);
  expect(bulkLifecycleCommitSchema.safeParse({...body,confirmed:true}).success).toBe(true);
 });
});
