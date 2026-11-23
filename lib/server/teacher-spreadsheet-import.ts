import type {SupabaseClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {z} from "zod";
import {createHash} from "node:crypto";
import {
  parseSpreadsheetBuffer,normalizeImportRows,suggestColumnMapping,familyGroupKey,
  type ColumnMapping,
} from "@/lib/spreadsheet-import";
import {getPolicy} from "@/lib/server/scheduling";
import {suggestMappingWithAi} from "@/lib/ai/provider";
export class SpreadsheetImportError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new SpreadsheetImportError(status,code,message);
export const MAX_SPREADSHEET_BYTES=2*1024*1024;
export type SpreadsheetRows={rows:Record<string,string>[];mapping:ColumnMapping};
export function teacherSpreadsheetPreview(input:SpreadsheetRows){
 if(!Array.isArray(input.rows)||input.rows.length>500)
   throw fail(400,"VALIDATION_ERROR","Provide 0–500 spreadsheet rows");
 const {rows,issues}=normalizeImportRows(input.rows,input.mapping);
 return {previewRows:rows.slice(0,50),previewTotal:rows.length,issues:issues.slice(0,40)};
}
const spreadsheetPayload={
 rows:z.array(z.record(z.string(),z.string())).max(500),
 mapping:z.record(z.string(),z.string().nullable()),workplaceId:z.string().uuid().optional(),
 workplaceColumn:z.string().trim().min(1).max(200).optional(),fallbackWorkplaceId:z.string().uuid().optional(),
 studentChoices:z.record(z.string().regex(/^[1-9][0-9]{0,6}$/),z.string().uuid()).optional(),
};
const approvedEnvelopeSchema=z.object({
 version:z.literal(1),teacherId:z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i),calendar:z.object({
  day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),timezone:z.string().max(80),
 }).strict(),
 venues:z.array(z.record(z.string(),z.unknown())).max(10000),
 rows:z.array(z.record(z.string(),z.unknown())).min(1).max(500),
 identities:z.array(z.record(z.string(),z.unknown())).min(1).max(500),
}).strict();
export const spreadsheetReviewSchema=z.object(spreadsheetPayload).strict();
export const spreadsheetCommitSchema=z.object({...spreadsheetPayload,
 confirmed:z.literal(true).optional(),idempotencyKey:z.string().uuid().optional(),
 reviewDigest:z.string().regex(/^[0-9a-f]{64}$/).optional(),reviewedEnvelope:approvedEnvelopeSchema.optional(),
}).strict();
export type SpreadsheetReviewInput=z.infer<typeof spreadsheetReviewSchema>;
export type SpreadsheetCommitInput=z.infer<typeof spreadsheetCommitSchema>;
const uuidLike=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function splitExplicitWorkplaceIds(value:string):string[]|null{
 const ids=value.split(";").map(x=>x.trim().toLowerCase());
 return ids.length>=2&&ids.length<=20&&ids.every(x=>uuidLike.test(x))?ids.sort():null;
}
function canonicalBytes(value:unknown):string{
 return JSON.stringify(value,(_key,item:unknown)=>item&&typeof item==="object"&&!Array.isArray(item)
  ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
}
function reviewDigestFor(teacherId:string,input:SpreadsheetReviewInput,envelope:z.infer<typeof approvedEnvelopeSchema>){
 const {rows,issues}=normalizeImportRows(input.rows,input.mapping);
 if(issues.length||rows.length!==envelope.rows.length)return null;
 if(input.workplaceColumn&&input.workplaceId)return null;
 for(let i=0;i<rows.length;i++){
  const row=rows[i],reviewed=envelope.rows[i];
  const {workplaceId,workplaceIds,sourceWorkplaceName,studentId,...prepared}=reviewed;
  if(canonicalBytes(prepared)!==canonicalBytes(row)||
     studentId!==input.studentChoices?.[String(row.sourceRow)])return null;
  const source=input.workplaceColumn?input.rows[row.sourceRow-2]?.[input.workplaceColumn]?.trim()??"":"";
  if(source.includes(";")&&Array.isArray(workplaceIds)){
   const split=splitExplicitWorkplaceIds(source);
   if(!split||canonicalBytes(split)!==canonicalBytes(workplaceIds)||
      workplaceId!==undefined||sourceWorkplaceName!==undefined)return null;
  }else if(workplaceIds!==undefined)return null;
  else if(source&&uuidLike.test(source)){
   if(workplaceId!==source.toLowerCase()||sourceWorkplaceName!==undefined)return null;
  }else if(source){
   if(sourceWorkplaceName!==source)return null;
  }else if(workplaceId!==(input.workplaceColumn?input.fallbackWorkplaceId:input.workplaceId)||sourceWorkplaceName!==undefined)
   return null;
 }
 return createHash("sha256").update(canonicalBytes({teacherId,envelope,normalized:rows,
  workspaceValues:input.workplaceColumn?rows.map(r=>input.rows[r.sourceRow-2]?.[input.workplaceColumn!]?.trim()??""):null,
  workplaceId:input.workplaceId,workplaceColumn:input.workplaceColumn,fallbackWorkplaceId:input.fallbackWorkplaceId,
  studentChoices:input.studentChoices??{},
 })).digest("hex");
}
async function reviewSpreadsheet(db:SupabaseClient,teacherId:string,input:SpreadsheetReviewInput){
 const {rows,issues}=normalizeImportRows(input.rows,input.mapping);
 const {data,error}=await db.from("workplaces").select("id,name").eq("teacher_id",teacherId)
  .is("archived_at",null).order("name").order("id");
 if(error)throw fail(503,"WORKPLACE_LOOKUP_FAILED","Could not verify active workplaces");
 const workplaces=data??[];
 const selected=workplaces.find(w=>w.id===input.workplaceId);
 const rowMode=Boolean(input.workplaceColumn);
 const fallback=workplaces.find(w=>w.id===input.fallbackWorkplaceId);
 const header=input.workplaceColumn??"";
 const modeConflict=Boolean((rowMode&&input.workplaceId)||(!rowMode&&input.fallbackWorkplaceId));
 const unknownColumn=rowMode&&!input.rows.some(row=>Object.hasOwn(row,header));
 const invalidFallback=rowMode&&Boolean(input.fallbackWorkplaceId)&&!fallback;
 const workplaceIssues:Array<{sourceRow:number|null;code:string}>=[];
 if(modeConflict)workplaceIssues.push({sourceRow:null,code:"WORKPLACE_MODE_CONFLICT"});
 if(unknownColumn)workplaceIssues.push({sourceRow:null,code:"WORKPLACE_COLUMN_MISSING"});
 if(invalidFallback)workplaceIssues.push({sourceRow:null,code:"WORKPLACE_NOT_AVAILABLE"});
 const prepared=modeConflict||unknownColumn||invalidFallback?[]:rows.flatMap(row=>{
  const source=rowMode?(input.rows[row.sourceRow-2]?.[header]??"").trim():"";
  const multi=source.includes(";")?splitExplicitWorkplaceIds(source):null;
  const idListIntent=source.includes(";")&&source.split(";").some(x=>uuidLike.test(x.trim()));
  if(idListIntent&&!multi){workplaceIssues.push({sourceRow:row.sourceRow,code:"WORKPLACE_LIST_INVALID"});return [];}
  if(multi&&new Set(multi).size!==multi.length){
   workplaceIssues.push({sourceRow:row.sourceRow,code:"WORKPLACE_TARGET_DUPLICATE"});return [];
  }
  const chosenId=!rowMode?selected?.id:!source?fallback?.id:uuidLike.test(source)?source.toLowerCase():undefined;
  const sourceWorkplaceName=source&&!multi&&!uuidLike.test(source)?source:undefined;
  if(!chosenId&&!multi&&!sourceWorkplaceName){
   if(rowMode)workplaceIssues.push({sourceRow:row.sourceRow,code:"WORKPLACE_ROW_REQUIRED"});
   return [];
  }
  if(sourceWorkplaceName&&sourceWorkplaceName.length>120){
   workplaceIssues.push({sourceRow:row.sourceRow,code:"WORKPLACE_NOT_AVAILABLE"});return [];
  }
  const studentId=input.studentChoices?.[String(row.sourceRow)];
  return [{...row,...(chosenId?{workplaceId:chosenId}:{}),...(multi?{workplaceIds:multi}:{}),
   ...(sourceWorkplaceName?{sourceWorkplaceName}:{}),...(studentId?{studentId}:{})}];
 });
 const unresolved=prepared.length!==rows.length||workplaceIssues.length>0||(!rowMode&&!selected);
 let authoritative:{issues:{sourceRow:number;code:string; candidates?:{id:string;name:string;archived:boolean}[]}[];
  canCommit:boolean;identities:Record<string,unknown>[];envelope:unknown;
  workplaceTargets:{sourceRow:number;workplaceId:string;workplaceName:string}[]}|null=null;
 if(!unresolved&&prepared.length&&!issues.length){
  const review=await db.rpc("ccp_teacher_spreadsheet_review",{p_rows:prepared});
  if(review.error){
   if(review.error.code==="22023")throw fail(422,"IMPORT_REVIEW_REQUIRED","Review the import field types and lengths");
   throw fail(503,"IMPORT_REVIEW_UNAVAILABLE","Could not verify import calendar or identities");
  }
  authoritative=review.data;
 }
 const parsed=approvedEnvelopeSchema.safeParse(authoritative?.envelope);
 const reviewedEnvelope=authoritative?.canCommit&&parsed.success?parsed.data:null;
 const reviewDigest=reviewedEnvelope?reviewDigestFor(teacherId,input,reviewedEnvelope):null;
 const dbIssues=authoritative?.issues??[];
 const duplicateIssues=dbIssues.filter(entry=>entry.code==="DUPLICATE_IMPORT_IDENTITY")
  .map(entry=>({row:entry.sourceRow,message:"Duplicate normalized student name in this spreadsheet"}));
 return {previewRows:rows,previewTotal:rows.length,issues:[...issues,...duplicateIssues],
  workplaces,selectedWorkplaceId:selected?.id??null,
  proposedDefaultWorkplaceId:!rowMode&&!input.workplaceId&&workplaces.length===1?workplaces[0].id:null,
  workplaceTargets:authoritative?.workplaceTargets??[],
  workplaceIssues:[...workplaceIssues,...dbIssues.filter(entry=>entry.code.startsWith("WORKPLACE_"))],
  identityIssues:dbIssues.filter(entry=>!entry.code.startsWith("WORKPLACE_")&&entry.code!=="DUPLICATE_IMPORT_IDENTITY"),
  identities:authoritative?.identities??[],reviewedEnvelope,reviewDigest,writesPerformed:false};
}
export async function teacherSpreadsheetReview(db:SupabaseClient,teacherId:string,input:SpreadsheetReviewInput){
 return reviewSpreadsheet(db,teacherId,input);
}
export function teacherSpreadsheetParse(filename:string,buffer:ArrayBuffer){
 if(buffer.byteLength>MAX_SPREADSHEET_BYTES)throw fail(413,"FILE_TOO_LARGE","Maximum spreadsheet size is 2 MB");
 let headers:string[],rows:Record<string,string>[];
 try{({headers,rows}=parseSpreadsheetBuffer(buffer,filename));}
 catch(error){throw fail(400,"VALIDATION_ERROR",error instanceof Error?error.message:"Could not parse spreadsheet");}
 if(!headers.length)throw fail(400,"VALIDATION_ERROR","No columns found in first sheet");
 if(rows.length>500)throw fail(400,"VALIDATION_ERROR","Import supports at most 500 rows at a time");
 const mapping=suggestColumnMapping(headers);
 const normalized=normalizeImportRows(rows,mapping);
 return {filename,headers,sampleRows:rows.slice(0,8),rowCount:rows.length,mapping,
  previewRows:normalized.rows.slice(0,50),previewTotal:normalized.rows.length,
  issues:normalized.issues.slice(0,40),rows};
}
export async function teacherSpreadsheetSuggest(db:SupabaseClient,teacherId:string,input:{
 headers:string[];sampleRows?:Record<string,string>[];useAi?:boolean;
 confirmedExternal?:boolean;
}){
 if(!Array.isArray(input.headers)||!input.headers.length||input.headers.length>150||
    input.headers.some(h=>typeof h!=="string"||h.length>200))
   throw fail(400,"VALIDATION_ERROR","Provide 1–150 text headers, each at most 200 characters");
 if(input.sampleRows!==undefined&&(!Array.isArray(input.sampleRows)||
    input.sampleRows.length>8||input.sampleRows.some(row=>
      !row||typeof row!=="object"||Array.isArray(row)||
      Object.keys(row).length>150||Object.entries(row).some(([key,value])=>
        key.length>200||typeof value!=="string"||value.length>512))))
   throw fail(400,"VALIDATION_ERROR","Sample rows must be at most 8 small text-only rows");
 if(input.useAi!==undefined&&typeof input.useAi!=="boolean")
   throw fail(400,"VALIDATION_ERROR","AI selection must be a boolean");
 if(!input.useAi)return {mapping:suggestColumnMapping(input.headers),warning:null};
 // A direct website POST, delegated MCP call or internal service call must
 // never disclose student/guardian samples to an external AI by default.
 if(input.confirmedExternal!==true)
   throw fail(400,"CONFIRMATION_REQUIRED","Approve sharing preview rows with the external AI provider first");
 const policy=await getPolicy(db,teacherId);
 if(policy.ai_provider==="none"||!policy.ai_api_key)
   throw fail(400,"NOT_CONFIGURED","Optional AI is not configured; map columns manually");
 const result=await suggestMappingWithAi({
  provider:policy.ai_provider,apiKey:policy.ai_api_key,
  headers:input.headers,sampleRows:(input.sampleRows??[]).slice(0,8),
 });
 if(result.error&&!Object.keys(result.mapping).length)
   throw fail(502,"AI_UNAVAILABLE",
    "Optional AI mapping unavailable; use the local column suggestions instead");
 return {mapping:result.mapping,
  warning:result.error?
   "AI mapping was incomplete; review every suggested column":null};
}
/** Atomic SQL import shared with the website and delegated MCP. One batch
 * either commits its whole student/family/receipt set or rolls it all back.
 * The default digest-derived UUID makes browser retries idempotent. A caller
 * may provide a new explicit key for a deliberately new import attempt.
 */
export async function teacherSpreadsheetCommit(
  supabase:SupabaseClient,teacherId:string,
  body:Partial<SpreadsheetCommitInput>,
):Promise<NextResponse>{
  if(!Array.isArray(body.rows)||!body.mapping)
    return NextResponse.json({error:"rows and mapping are required"},{status:400});
  if(body.rows.length<1||body.rows.length>500)
    return NextResponse.json({error:"Import requires 1–500 rows"},{status:400});
  const normalized=normalizeImportRows(body.rows,body.mapping);
  const {rows,issues:rowIssues}=normalized;
  if(rowIssues.length)return NextResponse.json({
    code:"IMPORT_REVIEW_REQUIRED",error:"Review and correct every spreadsheet row issue before committing. No rows were imported.",issues:rowIssues,
  },{status:422});
  const issues=rowIssues;
  const input={rows:body.rows,mapping:body.mapping,workplaceId:body.workplaceId,
   workplaceColumn:body.workplaceColumn,fallbackWorkplaceId:body.fallbackWorkplaceId,studentChoices:body.studentChoices};
  const {reviewedEnvelope}=body;
  // No fresh or replay attempt re-queries current venue state before calling
  // the receipt-first canonical writer. An exact retired-venue retry survives.
  let pRows:unknown;
  let keyMaterial:unknown;
  if(reviewedEnvelope){
   const digest=reviewDigestFor(teacherId,input,reviewedEnvelope);
   if(!digest||body.reviewDigest!==digest||body.confirmed!==true)
    return NextResponse.json({code:"IMPORT_REVIEW_REQUIRED",error:"Review and confirm the exact current import",issues},{status:422});
   pRows={...reviewedEnvelope,confirmed:true};keyMaterial=pRows;
  }else{
   if(!body.workplaceId&&!body.workplaceColumn){
    const review=await reviewSpreadsheet(supabase,teacherId,input).catch(()=>null);
    return NextResponse.json({code:"WORKPLACE_REQUIRED",
     error:"Select an active workplace in the import review. No students were created or changed.",
     workplaces:review?.workplaces??[],issues},{status:422});
   }
   if(body.workplaceColumn||body.reviewDigest||!body.workplaceId)
    return NextResponse.json({code:"IMPORT_REVIEW_REQUIRED",error:"Review and confirm the exact current import",issues},{status:422});
   // Legacy explicit-venue array content can reach only a previously
   // committed exact receipt, never a fresh SQL write.
   pRows=rows.map(row=>({...row,familyKey:familyGroupKey(row),workplaceId:body.workplaceId}));
   keyMaterial=pRows;
  }
  const digest=createHash("sha256").update(reviewedEnvelope?canonicalBytes(keyMaterial):JSON.stringify(keyMaterial)).digest("hex");
  const defaultKey=digest.slice(0,8)+"-"+digest.slice(8,12)+"-5"+
    digest.slice(13,16)+"-a"+digest.slice(17,20)+"-"+digest.slice(20,32);
  const key=body.idempotencyKey??defaultKey;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
    return NextResponse.json({error:"Invalid import idempotency key"},{status:400});
  const authoritativeDenial=Boolean(reviewedEnvelope&&reviewedEnvelope.teacherId===teacherId);
  const {data,error}=await supabase.rpc("ccp_teacher_spreadsheet_commit",{
    p_rows:pRows,p_idempotency_key:key,
  });
  if(error){
    const code=error.message??"";
    if(code==="IMPORT_PREVIEW_CHANGED"||code==="IMPORT_ENROLLMENT_NOT_EFFECTIVE")
      return NextResponse.json({error:"Import review changed. Review the current calendar, identities and workplaces.",
        code:"IMPORT_PREVIEW_CHANGED",issues,authoritativeDenial},{status:409});
    if(code==="IMPORT_REVIEW_REQUIRED"&&!reviewedEnvelope&&body.workplaceId){
      const review=await reviewSpreadsheet(supabase,teacherId,input).catch(()=>null);
      if(review&&!review.selectedWorkplaceId)
       return NextResponse.json({code:"WORKPLACE_REQUIRED",error:"Select an active workplace in the import review",
        workplaces:review.workplaces,issues},{status:422});
    }
    if(code==="IMPORT_REVIEW_REQUIRED")
      return NextResponse.json({error:"Review and confirm the exact current import",
        code:"IMPORT_REVIEW_REQUIRED",issues},{status:422});
    if(code==="CAPACITY_EXCEEDED")
      return NextResponse.json({error:"Active-student capacity reached. No rows were imported.",
        code:"CAPACITY_EXCEEDED",issues,authoritativeDenial},{status:409});
    if(code.includes("IMPORT_REPLAY_CONFLICT"))
      return NextResponse.json({error:"Import idempotency key reused with changed data",
        code:"IMPORT_REPLAY_CONFLICT",issues},{status:409});
    return NextResponse.json({
      error:"Import rejected. No student or family changes were committed.",issues,
      code:"IMPORT_FAILED",
    },{status:500});
  }
  return NextResponse.json({...data,issues});
}
