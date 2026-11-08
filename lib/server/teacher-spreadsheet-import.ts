import type {SupabaseClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {
  parseSpreadsheetBuffer,normalizeImportRows,suggestColumnMapping,familyGroupKey,
  type ColumnMapping,type NormalizedImportRow,
} from "@/lib/spreadsheet-import";
import {insertGuardian} from "@/lib/server/families";
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
}){
 if(!Array.isArray(input.headers)||!input.headers.length||input.headers.length>150)
   throw fail(400,"VALIDATION_ERROR","Provide between 1 and 150 headers");
 if(!input.useAi)return {mapping:suggestColumnMapping(input.headers),warning:null};
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
/** The existing website commit algorithm, now shared with delegated MCP.
 * Returns HTTP-style status and body to preserve exact UI semantics.
 */
export async function teacherSpreadsheetCommit(
 supabase:SupabaseClient,teacherId:string,
 body:{rows?:Record<string,string>[];mapping?:ColumnMapping},
):Promise<NextResponse>{
 const user={id:teacherId};
  if (!Array.isArray(body.rows) || !body.mapping) {
    return NextResponse.json(
      { error: "rows and mapping are required" },
      { status: 400 }
    );
  }

  if (body.rows.length > 500) {
    return NextResponse.json(
      { error: "Import is limited to 500 rows at a time" },
      { status: 400 }
    );
  }

  const { rows, issues } = normalizeImportRows(body.rows, body.mapping);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid student rows to import", issues },
      { status: 400 }
    );
  }

  const {
    assertWithinHostedLimit,
    limitReachedResponse,
  } = await import("@/lib/server/entitlements");
  // Pre-check against unique new names after skip logic would be ideal; gate on
  // raw valid row count so free-tier imports cannot blow past the cap.
  const importLimitCheck = await assertWithinHostedLimit(
    supabase,
    user.id,
    "students",
    rows.length
  );
  if (!importLimitCheck.allowed) {
    return NextResponse.json(
      {
        ...limitReachedResponse(importLimitCheck),
        issues,
      },
      { status: 403 }
    );
  }

  const { data: existingStudents } = await supabase
    .from("students")
    .select("id, name")
    .eq("teacher_id", user.id);

  const existingNames = new Set(
    (existingStudents ?? []).map((s) => s.name.trim().toLowerCase())
  );

  const { data: existingGuardians } = await supabase
    .from("guardians")
    .select("id, email, name")
    .eq("teacher_id", user.id);

  const guardianByEmail = new Map<string, string>();
  for (const g of existingGuardians ?? []) {
    if (g.email?.trim()) {
      guardianByEmail.set(g.email.trim().toLowerCase(), g.id);
    }
  }

  const groups = new Map<string, NormalizedImportRow[]>();
  for (const row of rows) {
    const key = familyGroupKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  let studentsCreated = 0;
  let studentsSkipped = 0;
  let familiesCreated = 0;
  const skipped: { row: number; reason: string }[] = [];

  for (const [, group] of groups) {
    const head = group[0];
    let guardianId: string | null = null;

    const email = head.email?.trim().toLowerCase() || null;
    if (email && guardianByEmail.has(email)) {
      guardianId = guardianByEmail.get(email)!;
    } else {
      const hasContact =
        Boolean(email) ||
        Boolean(head.phone) ||
        Boolean(head.guardianName) ||
        Boolean(head.familyName);

      if (hasContact || group.length >= 1) {
        const guardianName =
          head.guardianName?.trim() ||
          head.familyName?.trim() ||
          (email || head.phone
            ? `Parent of ${head.studentName}`
            : head.studentName);

        const { data: guardian, error } = await insertGuardian(
          supabase,
          user.id,
          {
            name: guardianName,
            familyName: head.familyName,
            email: head.email,
            phone: head.phone,
            secondaryName: head.secondaryName,
            secondaryEmail: head.secondaryEmail,
            secondaryPhone: head.secondaryPhone,
          }
        );

        if (error || !guardian) {
          for (const r of group) {
            skipped.push({
              row: r.sourceRow,
              reason: error?.message ?? "Failed to create family",
            });
            studentsSkipped += 1;
          }
          continue;
        }

        guardianId = guardian.id;
        familiesCreated += 1;
        if (email) guardianByEmail.set(email, guardian.id);
      }
    }

    for (const r of group) {
      const key = r.studentName.trim().toLowerCase();
      if (existingNames.has(key)) {
        studentsSkipped += 1;
        skipped.push({
          row: r.sourceRow,
          reason: `Student "${r.studentName}" already exists`,
        });
        continue;
      }

      const { error } = await supabase.from("students").insert({
        teacher_id: user.id,
        name: r.studentName.trim(),
        guardian_id: guardianId,
        birthdate: r.birthdate,
        level: r.level,
        teacher_notes: r.teacherNotes ?? "",
      });

      if (error) {
        studentsSkipped += 1;
        skipped.push({ row: r.sourceRow, reason: error.message });
        continue;
      }

      existingNames.add(key);
      studentsCreated += 1;
    }
  }

  return NextResponse.json({
    studentsCreated,
    studentsSkipped,
    familiesCreated,
    issues,
    skipped: skipped.slice(0, 50),
  });
}
