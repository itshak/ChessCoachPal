import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {buildStudioExport,importStudioExport,parseExportPayload,type StudioDataExport} from "@/lib/data-transfer";

type Db=SupabaseClient;
export class TeacherTransferError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new TeacherTransferError(status,code,message);
export const MAX_MCP_EXPORT_BYTES=512*1024;
export const MAX_MCP_IMPORT_BYTES=2*1024*1024;
/** Full website backups may preserve portal links. Model-visible exports never
 * include guardian portal credentials, provider credentials or OAuth sessions.
 * Importing a sanitized backup rotates the family's portal token.
 */
export async function teacherExport(db:Db,teacherId:string){
 return await buildStudioExport(db,teacherId);
}
export async function teacherSafeExport(db:Db,teacherId:string){
 const full=await teacherExport(db,teacherId);
 const raw=full.tables.guardians;
 const familyRows=Array.isArray(raw)?raw as Record<string,unknown>[]:[];
 const tables={
   ...full.tables,
   guardians:familyRows.map(({portal_token,...safe})=>safe),
 };
 const payload={...full,tables};
 const encoded=JSON.stringify(payload);
 if(Buffer.byteLength(encoded,"utf8")>MAX_MCP_EXPORT_BYTES)
  throw fail(413,"EXPORT_TOO_LARGE",
   "Export exceeds MCP response limit. Download the full backup securely from /api/settings/export while signed in to ChessCoachPal.");
 return {export:payload,guardianPortalLinksExcluded:true,bytes:Buffer.byteLength(encoded,"utf8")};
}
export type TransferPreview={payload:StudioDataExport;sha256:string;counts:Record<string,number>;
 bytes:number;warnings:string[]};
export function teacherImportPreview(raw:unknown,maxBytes=MAX_MCP_IMPORT_BYTES):TransferPreview {
 const payload=parseExportPayload(raw);
 if(!payload)throw fail(400,"VALIDATION_ERROR","Unrecognized export format or missing tables");
 const serialized=JSON.stringify(payload);
 const bytes=Buffer.byteLength(serialized,"utf8");
 if(bytes>maxBytes)throw fail(413,"IMPORT_TOO_LARGE","Export is too large for a single import request");
 const counts:Record<string,number>={};
 for(const [name,entries] of Object.entries(payload.tables)){
  counts[name]=Array.isArray(entries)?entries.length:entries?1:0;
 }
 const guardians=payload.tables.guardians;
 const missingToken=Array.isArray(guardians)&&guardians.some(x=>!x.portal_token);
 const warnings=[
  "Import upserts by existing IDs and may update current student/family and financial data. It is not a dry-run transaction.",
  ...(missingToken?["Imported guardians without portal links receive freshly generated links. Existing portal links for those records will be invalidated."]:[]),
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
 const result=await importStudioExport(db,teacherId,preview.payload);
 if(!result.ok)throw fail(500,"IMPORT_FAILED",result.error);
 return {ok:true,counts:result.counts,
  message:"Import complete. Matching IDs were updated; new IDs were inserted.",
  sha256:preview.sha256};
}
