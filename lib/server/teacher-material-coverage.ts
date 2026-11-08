import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {validateReportRange} from "@/lib/coaching-report";
import {materialCoverageSummary,type MaterialEvidenceRow} from "@/lib/material-coverage-report";

type Db=SupabaseClient;
const uuid=z.string().uuid();
export const materialCoverageFilter=z.object({
 studentId:uuid.optional(),workplaceId:uuid.optional(),
 from:z.string().date(),to:z.string().date(),
}).strict().refine(v=>Boolean(v.studentId||v.workplaceId),{
 message:"Choose a workplace or student",
}).refine(v=>v.from<=v.to,{message:"End date precedes start date"});
export class MaterialCoverageError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new MaterialCoverageError(status,code,message);
export async function teacherMaterialCoverageReport(db:Db,teacherId:string,
 input:z.infer<typeof materialCoverageFilter>){
 try{validateReportRange(input.from,input.to);}
 catch{throw fail(400,"VALIDATION_ERROR","Report dates must span at most 367 days");}
 const ownership=await Promise.all([
  input.studentId?db.from("students").select("id,name").eq("teacher_id",teacherId)
   .eq("id",input.studentId).maybeSingle():Promise.resolve({data:null,error:null}),
  input.workplaceId?db.from("workplaces").select("id,name").eq("teacher_id",teacherId)
   .eq("id",input.workplaceId).maybeSingle():Promise.resolve({data:null,error:null}),
 ]);
 const [student,workplace]=ownership;
 if(student.error||workplace.error)throw fail(500,"DATABASE_ERROR","Report authorization unavailable");
 if(input.studentId&&!student.data)throw fail(404,"NOT_FOUND","Student not found");
 if(input.workplaceId&&!workplace.data)throw fail(404,"NOT_FOUND","Workplace not found");
 const rows:MaterialEvidenceRow[]=[];
 const PAGE=500,MAX=10000;
 for(let offset=0;;offset+=PAGE){
  let query=db.from("chess_material_progress").select(
   "id,student_id,session_id,resource_id,stage,occurred_on,chess_learning_resources(label,url,resource_type,provider_study_id,provider_chapter_id)"
  ).eq("teacher_id",teacherId).is("voided_at",null)
   .gte("occurred_on",input.from).lte("occurred_on",input.to)
   .order("id").range(offset,offset+PAGE-1);
  if(input.studentId)query=query.eq("student_id",input.studentId);
  if(input.workplaceId)query=query.eq("workplace_id",input.workplaceId);
  const {data,error}=await query;
  if(error)throw fail(500,"DATABASE_ERROR","Material coverage report unavailable");
  rows.push(...((data??[]) as unknown as MaterialEvidenceRow[]));
  if(rows.length>MAX)throw fail(413,"RANGE_TOO_LARGE","Narrow the period or choose a student");
  if((data?.length??0)<PAGE)break;
 }
 const summary=materialCoverageSummary(rows);
 return {filter:{from:input.from,to:input.to,student:student.data??null,
  workplace:workplace.data??null},
  ...summary,completeRange:true};
}
