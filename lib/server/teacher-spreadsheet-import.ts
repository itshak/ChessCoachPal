import type {SupabaseClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
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
   throw fail(502,"AI_UNAVAILABLE",result.error);
 return {mapping:result.mapping,warning:result.error};
}
/** Atomic SQL import shared with the website and delegated MCP. One batch
 * either commits its whole student/family/receipt set or rolls it all back.
 * The default digest-derived UUID makes browser retries idempotent. A caller
 * may provide a new explicit key for a deliberately new import attempt.
 */
export async function teacherSpreadsheetCommit(
  supabase:SupabaseClient,teacherId:string,
  body:{rows?:Record<string,string>[];mapping?:ColumnMapping;idempotencyKey?:string},
):Promise<NextResponse>{
  void teacherId; // The SQL function independently authorizes auth.uid().
  if(!Array.isArray(body.rows)||!body.mapping)
    return NextResponse.json({error:"rows and mapping are required"},{status:400});
  if(body.rows.length<1||body.rows.length>500)
    return NextResponse.json({error:"Import requires 1–500 rows"},{status:400});
  const {rows,issues}=normalizeImportRows(body.rows,body.mapping);
  if(!rows.length)return NextResponse.json({
    error:"No valid student rows to import",issues,
  },{status:400});
  const prepared=rows.map(row=>({...row,familyKey:familyGroupKey(row)}));
  const digest=createHash("sha256").update(JSON.stringify(prepared)).digest("hex");
  const defaultKey=digest.slice(0,8)+"-"+digest.slice(8,12)+"-5"+
    digest.slice(13,16)+"-a"+digest.slice(17,20)+"-"+digest.slice(20,32);
  const key=body.idempotencyKey??defaultKey;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
    return NextResponse.json({error:"Invalid import idempotency key"},{status:400});
  const {data,error}=await supabase.rpc("ccp_teacher_spreadsheet_commit",{
    p_rows:prepared,p_idempotency_key:key,
  });
  if(error){
    const code=error.message??"";
    if(code.includes("HOSTED_LIMIT_REACHED"))
      return NextResponse.json({error:"Active-student capacity reached",
        code:"HOSTED_LIMIT_REACHED",issues},{status:403});
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
