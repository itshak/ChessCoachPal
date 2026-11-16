import {createHash} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {historicalFail,teacherHistoricalStageRead,
  MAX_HISTORICAL_ROWS} from "@/lib/server/teacher-historical-stage";

const uuid=z.string().uuid();
const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const historicalInputSchema=z.object({
  stageId:uuid.optional(),
  // Small typed direct imports are useful for conversational MCP. Large
  // inputs must use private staged files and pass only their stageId.
  rows:z.array(z.record(z.string(),z.string())).min(1).max(50).optional(),
  mapping:z.record(z.string(),z.string().nullable()).optional(),
  resolutions:z.record(z.string(),z.object({studentId:uuid.optional(),
    workplaceId:uuid.optional()}).strict()).optional(),
  schoolYearStart:isoDate,schoolYearEnd:isoDate,
  timezone:z.string().min(1).max(100),
}).strict().refine(x=>Boolean(x.stageId)!==Boolean(x.rows),
  "Provide either stageId or small direct rows, not both");
export const historicalCommitSchema=historicalInputSchema.safeExtend({
  previewDigest:z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey:uuid,confirmed:z.literal(true),
});
export const historicalReportSchema=z.object({
  studentId:uuid.optional(),workplaceId:uuid.optional(),
  offset:z.number().int().min(0).max(100000).default(0),
  limit:z.number().int().min(1).max(200).default(50),
}).strict();
export type HistoricalInput=z.infer<typeof historicalInputSchema>;
export type HistoricalMapping=Record<string,string|null>;

type Field="studentName"|"studentId"|"workplaceName"|"workplaceId"|"attendedOn"|
 "periodStart"|"periodEnd"|"attendanceStatus"|"lessonCount"|"mode"|"sourceLabel"|
 "sourceTimezone";
const synonyms:Record<Field,string[]>={
 studentName:["student name","student","learner","pupil"],
 studentId:["student id","student uuid","learner id"],
 workplaceName:["workplace","workplace name","school","location","academy"],
 workplaceId:["workplace id","school id","workplace uuid"],
 attendedOn:["attendance date","lesson date","date","attended on"],
 periodStart:["period start","from date","start date","range start"],
 periodEnd:["period end","to date","end date","range end"],
 attendanceStatus:["attendance status","attendance","status","present absent"],
 lessonCount:["lesson count","lessons count","number of lessons","count","lessons"],
 mode:["record type","record mode","mode","kind"],
 sourceLabel:["source label","source note","source ref","reference"],
 sourceTimezone:["source timezone","timezone","time zone"],
};
const normalized=(name:string)=>name.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("en");
export function suggestHistoricalMapping(headers:string[]):HistoricalMapping{
 const chosen:HistoricalMapping={},used=new Set<string>();
 for(const [field,names] of Object.entries(synonyms)){
  const found=headers.find(h=>!used.has(h)&&names.includes(normalized(h)));
  if(found){chosen[field]=found;used.add(found);}
 }
 return chosen;
}
const validDate=(raw:string)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return false;
 const d=new Date(raw+"T00:00:00.000Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===raw;
};
const asSha=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function checkTimezone(value:string){
 try{new Intl.DateTimeFormat("en",{timeZone:value}).format(new Date());return true;}
 catch{return false;}
}
type PreparedRecord={
 sourceRow:number;studentId:string;workplaceId:string;
 mode:"dated"|"aggregate";attendedOn:string|null;periodStart:string|null;
 periodEnd:string|null;attendanceStatus:"present"|"late"|"absent"|"excused";
 lessonCount:number;sourceLabel:string;sourceTimezone:string;
};
type PreviewIssue={row:number;code:string;message:string;candidateIds?:string[]};
const headerValue=(row:Record<string,string>,mapping:HistoricalMapping,field:Field)=>
 (row[mapping[field]??""]??"").trim();
function strictStatus(value:string){
 const word=normalized(value);
 return word==="attended"?"present":word==="present"?"present":
  word==="late"?"late":word==="absent"?"absent":word==="excused"?"excused":null;
}
async function paginate(db:SupabaseClient,table:"students"|"workplaces",
 teacherId:string,columns:string){
 const all:Record<string,unknown>[]=[];
 for(let start=0;start<10_000;start+=500){
  const {data,error}=await db.from(table).select(columns).eq("teacher_id",teacherId)
    .order("id").range(start,start+499);
  if(error)return historicalFail(503,"PREVIEW_UNAVAILABLE","Identity roster unavailable");
  all.push(...((data??[]) as unknown as Record<string,unknown>[]));
  if((data??[]).length<500)return all;
 }
 return historicalFail(413,"ROSTER_TOO_LARGE","Identity roster exceeds supported preview bounds");
}
async function historicalPrepare(db:SupabaseClient,teacherId:string,
 raw:z.input<typeof historicalInputSchema>){
 const parsed=historicalInputSchema.safeParse(raw);
 if(!parsed.success)return historicalFail(400,"VALIDATION_ERROR",
  parsed.error.issues.map(x=>x.message).join("; ").slice(0,240));
 const input=parsed.data;
 if(!validDate(input.schoolYearStart)||!validDate(input.schoolYearEnd)||
    input.schoolYearStart>input.schoolYearEnd||
    Number(input.schoolYearEnd.slice(0,4))-Number(input.schoolYearStart.slice(0,4))>10)
  return historicalFail(400,"INVALID_SCHOOL_YEAR","Provide an explicit valid school-year date range");
 if(!checkTimezone(input.timezone))
  return historicalFail(400,"INVALID_TIMEZONE","Provide an explicit IANA timezone");
 let rows:Record<string,string>[],sha256:string,filename:string;
 let headers:string[];
 if(input.stageId){
  const stage=await teacherHistoricalStageRead(db,teacherId,input.stageId);
  rows=stage.rows;headers=stage.headers;sha256=stage.sha256;filename=stage.stage.filename;
 }else{
  rows=input.rows??[];headers=[...new Set(rows.flatMap(row=>Object.keys(row)))];
  sha256=asSha(rows);filename="reviewed-direct-rows";
 }
 if(rows.length<1||rows.length>MAX_HISTORICAL_ROWS)
  return historicalFail(413,"ROW_LIMIT","Maximum 2000 historical source rows");
 const mapping={...suggestHistoricalMapping(headers),...input.mapping};
 const keys=new Set<string>();
 for(const [field,header] of Object.entries(mapping)){
  if(!(field in synonyms)||header!==null&&(!headers.includes(header)||typeof header!=="string"))
   return historicalFail(400,"INVALID_MAPPING","Mapped source column does not exist");
  if(header){
   if(keys.has(header))return historicalFail(400,"INVALID_MAPPING","A source column cannot map to multiple fields");
   keys.add(header);
  }
 }
 if(!mapping.studentName&&!mapping.studentId)
  return historicalFail(400,"INVALID_MAPPING","Map student name or stable student ID");
 if(!mapping.workplaceName&&!mapping.workplaceId)
  return historicalFail(400,"INVALID_MAPPING","Map workplace name or ID");
 if(!mapping.attendanceStatus)
  return historicalFail(400,"INVALID_MAPPING","Map explicit attendance status");
 const [students,workplaces]=await Promise.all([
  paginate(db,"students",teacherId,"id,name,name_aliases,archived_at"),
  paginate(db,"workplaces",teacherId,"id,name,timezone"),
 ]);
 const studentById=new Map(students.map(s=>[String(s.id),s]));
 const workplaceById=new Map(workplaces.map(w=>[String(w.id),w]));
 const studentMatches=new Map<string,Set<string>>();
 for(const student of students){
  const names=[student.name,...(Array.isArray(student.name_aliases)?student.name_aliases:[])];
  for(const candidate of names){
   if(typeof candidate!=="string"||!candidate.trim())continue;
   const label=normalized(candidate);
   if(!studentMatches.has(label))studentMatches.set(label,new Set());
   studentMatches.get(label)!.add(String(student.id));
  }
 }
 const workplaceMatches=new Map<string,Set<string>>();
 for(const workplace of workplaces){
  const key=normalized(String(workplace.name));
  if(!workplaceMatches.has(key))workplaceMatches.set(key,new Set());
  workplaceMatches.get(key)!.add(String(workplace.id));
 }
 const entries:PreparedRecord[]=[];
 const issues:PreviewIssue[]=[];
 const seenKeys=new Set<string>();
 for(let i=0;i<rows.length;i++){
  const sourceRow=i+2,row=rows[i];
  const read=(field:Field)=>headerValue(row,mapping,field);
  const resolution=input.resolutions?.[String(sourceRow)];
  const studentName=read("studentName"),workplaceName=read("workplaceName");
  const studentId=resolution?.studentId||read("studentId");
  const workplaceId=resolution?.workplaceId||read("workplaceId");
  let student:string|null=null,workplace:string|null=null;
  if(studentId){
   if(studentById.has(studentId))student=studentId;
   else issues.push({row:sourceRow,code:"STUDENT_NOT_FOUND",message:"Student ID is not owned by this teacher"});
  }else{
   const ids=[...(studentMatches.get(normalized(studentName))??[])];
   if(ids.length===1)student=ids[0];
   else issues.push({row:sourceRow,code:ids.length?"AMBIGUOUS_STUDENT":"UNKNOWN_STUDENT",
     message:ids.length?"Student name or alias identifies multiple pupils":"Student not found; resolve to an existing ID",
     ...(ids.length?{candidateIds:ids.sort()}:{}),
   });
  }
  if(workplaceId){
   if(workplaceById.has(workplaceId))workplace=workplaceId;
   else issues.push({row:sourceRow,code:"WORKPLACE_NOT_FOUND",
    message:"Workplace ID is not owned by this teacher"});
  }else{
   const ids=[...(workplaceMatches.get(normalized(workplaceName))??[])];
   if(ids.length===1)workplace=ids[0];
   else issues.push({row:sourceRow,code:ids.length?"AMBIGUOUS_WORKPLACE":"UNKNOWN_WORKPLACE",
    message:ids.length?"Workplace name matches multiple workplaces":"Workplace is missing or unknown",
    ...(ids.length?{candidateIds:ids.sort()}:{}),
   });
  }
  const status=strictStatus(read("attendanceStatus"));
  if(!status)issues.push({row:sourceRow,code:"UNKNOWN_ATTENDANCE",
    message:"Specify present, late, absent or excused explicitly"});
  const date=read("attendedOn"),pStart=read("periodStart"),pEnd=read("periodEnd");
  const kind=normalized(read("mode"))|| (date?"dated":(pStart||pEnd)?"aggregate":"");
  if(!["dated","aggregate"].includes(kind)){
   issues.push({row:sourceRow,code:"MISSING_DATE_PRECISION",
    message:"Specify an exact ISO lesson date or an explicit aggregate period; dates are never invented"});
  }
  const countText=read("lessonCount");
  const count=countText?Number(countText):kind==="dated"?1:NaN;
  if(!Number.isSafeInteger(count)||count<1||count>1000)
   issues.push({row:sourceRow,code:"INVALID_COUNT",message:"Lesson count must be 1–1000"});
  if(kind==="dated"&&(
     !validDate(date)||date<input.schoolYearStart||date>input.schoolYearEnd||
     pStart!==""||pEnd!==""||count!==1))
   issues.push({row:sourceRow,code:"INVALID_DATED_ROW",
    message:"Dated evidence requires one exact ISO date within the year and count 1"});
  if(kind==="aggregate"&&(
    date!==""||!validDate(pStart)||!validDate(pEnd)||pStart>pEnd||
    pStart<input.schoolYearStart||pEnd>input.schoolYearEnd))
   issues.push({row:sourceRow,code:"INVALID_AGGREGATE",
    message:"Aggregate evidence requires explicit ISO period start and end; no invented session dates"});
  const rowTimezone=read("sourceTimezone")||input.timezone;
  if(!checkTimezone(rowTimezone))
   issues.push({row:sourceRow,code:"INVALID_TIMEZONE",message:"Invalid source IANA timezone"});
  const sourceLabel=(read("sourceLabel")||filename+"#"+sourceRow).slice(0,256);
  if(!student||!workplace||!status||!["dated","aggregate"].includes(kind)||
    !Number.isSafeInteger(count)||count<1||count>1000||
    !checkTimezone(rowTimezone)||kind==="dated"&&(!validDate(date)||count!==1||
    pStart!==""||pEnd!==""||date<input.schoolYearStart||date>input.schoolYearEnd)||
    kind==="aggregate"&&(!validDate(pStart)||!validDate(pEnd)||date!==""||
    pStart>pEnd||pStart<input.schoolYearStart||pEnd>input.schoolYearEnd))continue;
  const entry:PreparedRecord={sourceRow,studentId:student,workplaceId:workplace,
    mode:kind as "dated"|"aggregate",attendedOn:kind==="dated"?date:null,
    periodStart:kind==="aggregate"?pStart:null,periodEnd:kind==="aggregate"?pEnd:null,
    attendanceStatus:status,lessonCount:count,sourceLabel,sourceTimezone:rowTimezone};
  const duplicateKey=[entry.studentId,entry.workplaceId,entry.mode,
    entry.attendedOn,entry.periodStart,entry.periodEnd,entry.attendanceStatus].join("|");
  if(seenKeys.has(duplicateKey)){
   issues.push({row:sourceRow,code:"DUPLICATE_EVIDENCE",
    message:"Duplicate student/workplace/date-or-period/status; review source rows"});
   continue;
  }
  seenKeys.add(duplicateKey);
  entries.push(entry);
 }
 const previewDigest=asSha({teacherId,schoolYearStart:input.schoolYearStart,
  schoolYearEnd:input.schoolYearEnd,timezone:input.timezone,sourceSha256:sha256,
  entries});
 return {
  entries,issues,previewDigest,sourceSha256:sha256,sourceRows:rows.length,
  mapping,filename,
  years:{start:input.schoolYearStart,end:input.schoolYearEnd},
  timezone:input.timezone,canCommit:entries.length>0&&issues.length===0,
 };
}
export async function teacherHistoricalAttendancePreview(db:SupabaseClient,
 teacherId:string,input:unknown){
 const prepared=await historicalPrepare(db,teacherId,input as HistoricalInput);
 return {
  previewDigest:prepared.previewDigest,sourceSha256:prepared.sourceSha256,
  sourceRows:prepared.sourceRows,previewTotal:prepared.entries.length,
  previewRows:prepared.entries.slice(0,100),
  issues:prepared.issues.slice(0,100),issueCount:prepared.issues.length,
  mapping:prepared.mapping,filename:prepared.filename,years:prepared.years,
  timezone:prepared.timezone,canCommit:prepared.canCommit,
  explanation:"Dated observations and aggregate counts are separate historical evidence, not synthesized teaching sessions.",
 };
}
export async function teacherHistoricalAttendanceCommit(db:SupabaseClient,
 teacherId:string,input:unknown){
 const validated=historicalCommitSchema.safeParse(input);
 if(!validated.success)
  return historicalFail(400,"VALIDATION_ERROR","Reviewed historical import, digest, UUID receipt and confirmation required");
 const body=validated.data;
 const prepared=await historicalPrepare(db,teacherId,body);
 const params={
  p_rows:prepared.entries,p_school_year_start:body.schoolYearStart,
  p_school_year_end:body.schoolYearEnd,p_timezone:body.timezone,
  p_source_sha256:prepared.sourceSha256,
  p_preview_digest:body.previewDigest,p_request_id:body.idempotencyKey,
 };
 // An exact retry must work even after the original commit created evidence.
 const replay=await db.rpc("ccp_historical_attendance_replay",params);
 if(replay.error){
  if(replay.error.message.includes("REPLAY_CONFLICT"))
   return historicalFail(409,"CONFLICT","Receipt key was used with different historical details");
  return historicalFail(503,"DATABASE_ERROR","Historical import replay lookup failed");
 }
 if(replay.data)return replay.data;
 if(!prepared.canCommit)
  return historicalFail(409,"REVIEW_REQUIRED","Resolve all ambiguous students, workplaces and invalid source rows");
 if(prepared.previewDigest!==body.previewDigest)
  return historicalFail(409,"PREVIEW_CHANGED","Historical import differs from reviewed preview");
 const {data,error}=await db.rpc("ccp_historical_attendance_commit",params);
 if(error){
  if(error.message.includes("REPLAY_CONFLICT")||error.message.includes("DUPLICATE"))
   return historicalFail(409,"CONFLICT","Historical evidence is duplicated or key was reused");
  if(error.message.includes("NOT_FOUND"))
   return historicalFail(404,"NOT_FOUND","A student or workplace is not in your account");
  if(error.message.includes("INVALID"))
   return historicalFail(400,"VALIDATION_ERROR","Historical evidence requires exact dates, period and owned IDs");
  return historicalFail(503,"DATABASE_ERROR","Atomic historical import was not committed");
 }
 return data;
}
export async function teacherHistoricalAttendanceReport(db:SupabaseClient,
 teacherId:string,filters:unknown){
 const parsed=historicalReportSchema.safeParse(filters);
 if(!parsed.success)return historicalFail(400,"VALIDATION_ERROR","Invalid history report filter");
 const {limit,offset,studentId,workplaceId}=parsed.data;
 let query=db.from("ccp_historical_attendance_evidence")
  .select("id,student_id,workplace_id,mode,attended_on,period_start,period_end,attendance_status,lesson_count,source_row,source_label,source_timezone,school_year_start,school_year_end,created_at",
   {count:"exact"})
  .eq("teacher_id",teacherId).order("created_at",{ascending:false})
  .order("id",{ascending:false}).range(offset,offset+limit-1);
 if(studentId)query=query.eq("student_id",studentId);
 if(workplaceId)query=query.eq("workplace_id",workplaceId);
 const {data,error,count}=await query;
 if(error)return historicalFail(503,"DATABASE_ERROR","Historical report unavailable");
 const records=data??[];
 const summary={
  datedObservations:records.filter(r=>r.mode==="dated").length,
  aggregateSourceRows:records.filter(r=>r.mode==="aggregate").length,
  aggregateDeclaredLessons:records.filter(r=>r.mode==="aggregate")
    .reduce((a,r)=>a+r.lesson_count,0),
 };
 return {records,summary,offset,limit,nextOffset:(count??0)>offset+records.length?
   offset+records.length:null,totalRows:count??0,
  warning:"Historical evidence is not counted as calendar sessions; aggregate-only values have no fabricated lesson dates."};
}

export async function teacherHistoricalAttendanceSummary(db:SupabaseClient,
 teacherId:string,filters:{studentId?:string;workplaceId?:string}={}){
 void teacherId;
 const {data,error}=await db.rpc("ccp_historical_attendance_summary",{
  p_student_id:filters.studentId??null,
  p_workplace_id:filters.workplaceId??null,
 });
 if(error){
  if(error.message.includes("NOT_FOUND"))
   return historicalFail(404,"NOT_FOUND","Student or workplace not found");
  return historicalFail(503,"DATABASE_ERROR","Historical evidence summary unavailable");
 }
 return data;
}
