import {createHash,randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {parseSpreadsheetBuffer} from "@/lib/spreadsheet-import";

export class HistoricalImportError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
export const historicalFail=(status:number,code:string,message:string):never=>{
  throw new HistoricalImportError(status,code,message);
};
export const HISTORICAL_STAGE_BUCKET="ccp-historical-imports";
export const MAX_HISTORICAL_STAGE_BYTES=8*1024*1024;
export const MAX_HISTORICAL_ROWS=2000;
const MIME_BY_EXTENSION:Record<string,string>={
  csv:"text/csv",tsv:"text/tab-separated-values",txt:"text/plain",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls:"application/vnd.ms-excel",
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type HistoricalStageMetadata={
  id:string;teacher_id:string;filename:string;storage_path:string;
  bytes:number;sha256:string;expires_at:string;created_at:string;
};
export async function teacherHistoricalStageUpload(db:SupabaseClient,teacherId:string,
  filename:string,buffer:ArrayBuffer){
  const clean=filename.trim().split(/[\\/]/).pop()??"";
  const ext=clean.split(".").pop()?.toLowerCase()??"";
  if(!MIME_BY_EXTENSION[ext]||clean.length<1||clean.length>150)
    return historicalFail(400,"INVALID_FILE","Upload CSV, TSV, TXT, XLS or XLSX with a short filename");
  if(buffer.byteLength<1||buffer.byteLength>MAX_HISTORICAL_STAGE_BYTES)
    return historicalFail(413,"FILE_TOO_LARGE","Historical spreadsheet must be at most 8 MB");
  // Validate the file and row count *before* storing any private bytes.
  let parsed:ReturnType<typeof parseSpreadsheetBuffer>;
  try{parsed=parseSpreadsheetBuffer(buffer,clean);}
  catch{return historicalFail(400,"INVALID_FILE","Unable to parse the spreadsheet");}
  if(!parsed.headers.length||!parsed.rows.length||parsed.rows.length>MAX_HISTORICAL_ROWS)
    return historicalFail(400,"INVALID_FILE","Spreadsheet needs 1–2000 data rows with headers");
  const id=randomUUID(),path=teacherId+"/"+id+"."+ext;
  const sha256=createHash("sha256").update(Buffer.from(buffer)).digest("hex");
  const {error:uploadError}=await db.storage.from(HISTORICAL_STAGE_BUCKET)
    .upload(path,Buffer.from(buffer),{
      upsert:false,contentType:MIME_BY_EXTENSION[ext],cacheControl:"0",
    });
  if(uploadError)return historicalFail(503,"UPLOAD_FAILED","Private spreadsheet staging failed");
  const expiresAt=new Date(Date.now()+2*60*60*1000-60_000).toISOString();
  const {data,error}=await db.from("ccp_historical_import_stages").insert({
    id,teacher_id:teacherId,filename:clean,storage_path:path,
    bytes:buffer.byteLength,sha256,expires_at:expiresAt,
  }).select("id,filename,bytes,sha256,expires_at").single();
  if(error){
    await db.storage.from(HISTORICAL_STAGE_BUCKET).remove([path]);
    return historicalFail(503,"UPLOAD_FAILED","Unable to record private staged spreadsheet");
  }
  return {stageId:data.id,filename:data.filename,bytes:data.bytes,
    sha256:data.sha256,expiresAt:data.expires_at,rowCount:parsed.rows.length,
    // These are headers, not private student data.
    headers:parsed.headers};
}
async function stageMeta(db:SupabaseClient,teacherId:string,stageId:string){
  if(!uuid.test(stageId))return historicalFail(400,"INVALID_STAGE","Invalid staged reference");
  const {data,error}=await db.from("ccp_historical_import_stages")
    .select("*").eq("teacher_id",teacherId).eq("id",stageId).maybeSingle();
  if(error)return historicalFail(503,"STAGE_UNAVAILABLE","Staged reference unavailable");
  if(!data)return historicalFail(404,"STAGE_NOT_FOUND","Staged reference not found");
  const meta=data as HistoricalStageMetadata;
  if(Date.parse(meta.expires_at)<=Date.now())
    return historicalFail(410,"STAGE_EXPIRED","Staged reference expired; upload again");
  if(!meta.storage_path.startsWith(teacherId+"/"))
    return historicalFail(404,"STAGE_NOT_FOUND","Staged file does not belong to this teacher");
  return meta;
}
export async function teacherHistoricalStageInfo(db:SupabaseClient,teacherId:string,stageId:string){
  const meta=await stageMeta(db,teacherId,stageId);
  return {stageId:meta.id,filename:meta.filename,bytes:meta.bytes,
    sha256:meta.sha256,expiresAt:meta.expires_at};
}
export async function teacherHistoricalStageRead(db:SupabaseClient,teacherId:string,stageId:string){
  const meta=await stageMeta(db,teacherId,stageId);
  const {data,error}=await db.storage.from(HISTORICAL_STAGE_BUCKET)
    .download(meta.storage_path);
  if(error||!data)return historicalFail(503,"STAGE_UNAVAILABLE","Private staged file unavailable");
  const bytes=await data.arrayBuffer();
  if(bytes.byteLength>MAX_HISTORICAL_STAGE_BYTES||bytes.byteLength!==meta.bytes||
     createHash("sha256").update(Buffer.from(bytes)).digest("hex")!==meta.sha256)
    return historicalFail(409,"STAGE_CHANGED","Staged file failed integrity verification");
  let parsed:ReturnType<typeof parseSpreadsheetBuffer>;
  try{parsed=parseSpreadsheetBuffer(bytes,meta.filename);}
  catch{return historicalFail(400,"INVALID_FILE","Staged spreadsheet is invalid");}
  if(parsed.rows.length<1||parsed.rows.length>MAX_HISTORICAL_ROWS)
    return historicalFail(413,"ROW_LIMIT","Maximum 2000 staged history rows");
  return {stage:await teacherHistoricalStageInfo(db,teacherId,stageId),
    headers:parsed.headers,rows:parsed.rows,sha256:meta.sha256};
}
export async function teacherHistoricalStageDelete(db:SupabaseClient,teacherId:string,stageId:string){
  // Cleanup is an explicit write action; expired references remain unreadable
  // until storage lifecycle/next owner cleanup removes them.
  if(!uuid.test(stageId))return historicalFail(400,"INVALID_STAGE","Invalid staged reference");
  const {data,error}=await db.from("ccp_historical_import_stages")
    .select("storage_path").eq("teacher_id",teacherId).eq("id",stageId).maybeSingle();
  if(error)return historicalFail(503,"STAGE_UNAVAILABLE","Cannot verify stage ownership");
  if(!data)return {deleted:true,stageId};
  const {error:storageError}=await db.storage.from(HISTORICAL_STAGE_BUCKET)
    .remove([data.storage_path]);
  if(storageError)return historicalFail(503,"STAGE_UNAVAILABLE","Cannot delete staged bytes");
  const {error:deleteError}=await db.from("ccp_historical_import_stages").delete()
    .eq("teacher_id",teacherId).eq("id",stageId);
  if(deleteError)return historicalFail(503,"STAGE_UNAVAILABLE","Cannot remove staged metadata");
  return {deleted:true,stageId};
}
