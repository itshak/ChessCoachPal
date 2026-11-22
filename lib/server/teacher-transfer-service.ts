import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {buildStudioExport,importStudioExport,parseExportPayload,OPERATOR_RESTORE_ONLY,type StudioDataExport} from "@/lib/data-transfer";

type Db=SupabaseClient;
export class TeacherTransferError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new TeacherTransferError(status,code,message);
export const MAX_MCP_EXPORT_BYTES=512*1024;
export const MAX_MCP_IMPORT_BYTES=2*1024*1024;
/** Portable exports never include portal capability digests or raw secrets.
 * Native financial evidence is backed up in full but cannot be forged by a
 * teacher import: supervised operator reconciliation remains mandatory.
 */
export async function teacherExport(db:Db,teacherId:string){
 return await buildStudioExport(db,teacherId);
}
export async function teacherSafeExport(db:Db,teacherId:string){
 const full=await teacherExport(db,teacherId);
 const contacts=Array.isArray(full.tables.contacts)
  ? full.tables.contacts as Record<string,unknown>[] : [];
 const received=Array.isArray(full.tables.received_payments)
  ? full.tables.received_payments as Record<string,unknown>[] : [];
 const tables={
   ...full.tables,
   contacts:contacts.map(({email,phone,...safe})=>safe),
   received_payments:received.map(({external_reference,...safe})=>safe),
 };
 const payload={...full,tables};
 const encoded=JSON.stringify(payload);
 if(Buffer.byteLength(encoded,"utf8")>MAX_MCP_EXPORT_BYTES)
  throw fail(413,"EXPORT_TOO_LARGE",
   "Export exceeds MCP response limit. Download the full backup securely from /api/settings/export while signed in to ChessCoachPal.");
 return {export:payload,portalCredentialsExcluded:true,contactDetailsExcluded:true,
  bytes:Buffer.byteLength(encoded,"utf8")};
}
export type TransferPreview={payload:StudioDataExport;sha256:string;counts:Record<string,number>;
 bytes:number;warnings:string[]};
export function teacherImportPreview(raw:unknown,maxBytes=MAX_MCP_IMPORT_BYTES):TransferPreview {
 const payload=parseExportPayload(raw);
 if(!payload)throw fail(400,"VALIDATION_ERROR","Backup payload does not match the current teacher-data schema");
 const serialized=JSON.stringify(payload);
 const bytes=Buffer.byteLength(serialized,"utf8");
 if(bytes>maxBytes)throw fail(413,"IMPORT_TOO_LARGE","Export is too large for a single import request");
 const counts:Record<string,number>={};
 for(const [name,entries] of Object.entries(payload.tables)){
  counts[name]=Array.isArray(entries)?entries.length:entries?1:0;
 }
 const protectedKinds=OPERATOR_RESTORE_ONLY.filter(table=>
    Array.isArray(payload.tables[table])&&payload.tables[table].length>0);
 const warnings=[
  "Preview changes no records. Import requires a SHA-256-reviewed, one-transaction tenant-scoped source and never mints guest portal access.",
  "Scoped portal grants in the portable backup contain no token digests; teachers must explicitly reissue grants after restore.",
  ...(protectedKinds.length?[(
    "This backup includes immutable financial or delivery history ("+
    protectedKinds.join(", ")+"). Automatic restore is blocked until a separately authorized operator preserves and verifies that evidence."
  )]:[]),
 ];
 return {payload,sha256:createHash("sha256").update(serialized).digest("hex"),counts,bytes,warnings};
}
export async function teacherImportApply(db:Db,teacherId:string,raw:unknown,expectedSha256:string){
 const preview=teacherImportPreview(raw);
 if(!/^[a-f0-9]{64}$/.test(expectedSha256))
  throw fail(400,"PREVIEW_REQUIRED","An explicitly reviewed SHA-256 digest is required");
 if(preview.sha256!==expectedSha256)
  throw fail(409,"PREVIEW_CHANGED","The import payload differs from the previously reviewed preview");
 // Domain import contains table allowlisting and writes only as this tenant.
 const result=await importStudioExport(db,teacherId,preview.payload,preview.sha256);
 if(!result.ok){
  if(result.code==="CAPACITY_EXCEEDED")throw fail(409,result.code,result.error);
  throw fail(500,"IMPORT_FAILED",result.error);
 }
 return {ok:true,counts:result.counts,
  message:"Import complete. Matching IDs were updated; new IDs were inserted.",
  sha256:preview.sha256};
}
