import {zipSync,strToU8} from "fflate";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {StudioDataExport} from "@/lib/data-transfer";
import {teacherExport,TeacherTransferError} from "@/lib/server/teacher-transfer-service";

// Binary ZIPs are website downloads; MCP returns only bounded, individually
// pageable UTF-8 CSV strings. Both use this same sanitized export projection.
const privateColumn=/^(portal_token|access_token|refresh_token|password|password_hash|client_secret|api_key|ai_api_key|stripe_secret_key|stripe_publishable_key|stripe_webhook_secret|oauth_token|token_encrypted|encrypted_.*)$/i;
export const MAX_MCP_CSV_BYTES=192*1024;

function safeRow(row:Record<string,unknown>){
 return Object.fromEntries(Object.entries(row).filter(([key])=>!privateColumn.test(key)));
}
export function csvTables(payload:StudioDataExport){
 const tables:Record<string,Record<string,unknown>[]>={};
 for(const [key,value] of Object.entries(payload.tables)){
  if(!/^[a-z][a-z0-9_]{0,79}$/.test(key))
   throw new Error("Unsafe CSV table name");
  tables[key]=Array.isArray(value)?value.map(safeRow):value?[safeRow(value)]:[];
 }
 tables.teacher_profile=payload.teacher_profile?[safeRow(payload.teacher_profile)]:[];
 return tables;
}
function csvValue(value:unknown):string{
 if(value===undefined||value===null)return "";
 const raw=typeof value==="object"?JSON.stringify(value):String(value);
 // Preserve literal text (including Hebrew names) without permitting Excel
 // formula injection through cells beginning with =, +, -, @ or whitespace
 // followed by those symbols. Escape tabs/control chars as well.
 const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
export function tableCsv(rows:Record<string,unknown>[],headers?:string[]){
 const columns=headers??[...new Set(rows.flatMap(r=>Object.keys(r)))].sort();
 if(columns.length===0)return "";
 const lines=[columns.map(csvValue).join(",")];
 for(const row of rows)lines.push(columns.map(k=>csvValue(row[k])).join(","));
 return lines.join("\r\n")+"\r\n";
}
export function makeTeacherCsvZip(payload:StudioDataExport){
 const tables=csvTables(payload),files:Record<string,Uint8Array>={};
 const manifest={exportedAt:payload.exportedAt,
  format:"UTF-8 CSV, one data category per file",
  caveat:"Sensitive credentials and family portal tokens are excluded. For lossless restore use the authenticated JSON export, not this CSV archive.",
  tables:Object.fromEntries(Object.entries(tables).map(([key,rows])=>[key,rows.length])),
 };
 files["README.json"]=strToU8(JSON.stringify(manifest,null,2));
 for(const [table,rows] of Object.entries(tables)){
  // Even empty tables must appear as distinct files in a full export.
  files[table+".csv"]=strToU8(tableCsv(rows));
 }
 return zipSync(files,{level:5});
}
export async function teacherCsvExport(db:SupabaseClient,teacherId:string,
 opts:{table?:string;offset:number;limit:number}){
 const all=csvTables(await teacherExport(db,teacherId));
 if(!opts.table)return {format:"csv",tables:Object.fromEntries(
  Object.entries(all).map(([name,rows])=>[name,{rowCount:rows.length}])),
  instructions:"Read each table by name using this tool with offset/limit. The website provides a single full ZIP download."};
 if(!Object.hasOwn(all,opts.table))
  throw new TeacherTransferError(400,"INVALID_TABLE","Unknown export table; list available tables first");
 const rows=all[opts.table];
 const start=opts.offset,limit=opts.limit;
 if(!Number.isInteger(start)||start<0||!Number.isInteger(limit)||limit<1||limit>200)
  throw new TeacherTransferError(400,"VALIDATION_ERROR","Use offset>=0 and limit 1–200");
 let end=Math.min(rows.length,start+limit),csv=tableCsv(rows.slice(start,end));
 const headers=[...new Set(rows.flatMap(r=>Object.keys(r)))].sort();
 csv=tableCsv(rows.slice(start,end),headers);
 while(end>start+1&&Buffer.byteLength(csv,"utf8")>MAX_MCP_CSV_BYTES){
  end=start+Math.floor((end-start)/2);
  csv=tableCsv(rows.slice(start,end),headers);
 }
 if(Buffer.byteLength(csv,"utf8")>MAX_MCP_CSV_BYTES)
  throw new TeacherTransferError(413,"ROW_TOO_LARGE",
   "One CSV row exceeds the safe MCP response size. Download the authenticated website ZIP instead.");
 return {format:"csv",table:opts.table,csv,returnedRows:end-start,
  totalRows:rows.length,offset:start,nextOffset:end<rows.length?end:null,
  guardianPortalCredentialsExcluded:true};
}
