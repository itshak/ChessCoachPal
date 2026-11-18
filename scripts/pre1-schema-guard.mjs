#!/usr/bin/env node
/**
 * ADR-0001 mechanical fresh-install contract. This guards against changes
 * reintroducing arbitrary schema upgrade chains (other than the explicitly
 * reviewed forward-only live data extensions), material compatibility mapping or
 * data-export version negotiation. It does not replace live tenant/RLS tests.
 */
import {readdirSync,readFileSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {transitionContractErrors} from "./schema-transition-contract.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(join(root,path),"utf8");
const BASELINE="20261107000000_chesscoachpal_baseline.sql";
const LIVE_EXTENSION="20261117000000_live_historical_lifecycle_extension.sql";
const WORKFLOW_EXTENSION="20261117190000_mcp_workflow_composition.sql";
const FAMILY_LOCALE_EXTENSION="20261117231554_family_communication_locale.sql";
const TEACHER_LOCALE_EXTENSION="20261118000000_multilingual_teacher_and_family_locale.sql";
const APPROVED_PREFIXES=[
 [BASELINE],
 [BASELINE,LIVE_EXTENSION],
 [BASELINE,LIVE_EXTENSION,WORKFLOW_EXTENSION],
 [BASELINE,LIVE_EXTENSION,FAMILY_LOCALE_EXTENSION],
 [BASELINE,LIVE_EXTENSION,WORKFLOW_EXTENSION,FAMILY_LOCALE_EXTENSION],
 [BASELINE,LIVE_EXTENSION,WORKFLOW_EXTENSION,FAMILY_LOCALE_EXTENSION,TEACHER_LOCALE_EXTENSION],
];

export function canonicalSchemaErrors({
 sqlFiles,sql,transfer,agent,catalog,studentPage,teacherComponents,strictMaterials=false,
 migrationManifest,transitionSources,
}){
 const errors=[];
 if(migrationManifest)errors.push(...transitionContractErrors({
   sqlFiles,sql,manifest:migrationManifest,transitionSources,
 }));
 if(!migrationManifest && !APPROVED_PREFIXES.some(expected=>
   expected.length===sqlFiles.length && expected.every((file,i)=>file===sqlFiles[i])))
   errors.push("Only the canonical baseline and explicitly approved ordered forward-only live extensions are permitted");
 if(!sql.includes("CREATE TABLE public.learning_materials")||
    !sql.includes("CREATE TABLE public.student_training_plans"))
   errors.push("Canonical snapshot is missing required current typed chess tables");
 // A single-dollar delimiter breaks the fresh Supabase SQL bootstrap but
 // cannot be caught by TypeScript or ordinary static tool-parity auditing.
 // PostgreSQL requires $ or a full named $tag$ on BOTH sides of a body.
 if(/\bAS[ \t]*\$(?:\r?\n|;)/.test(sql)||/\bEND;[ \t\r\n]*\$;/.test(sql))
   errors.push("SQL function body uses malformed single-dollar delimiter");
 for(const [label,source] of Object.entries({sql,transfer,agent,catalog,studentPage,teacherComponents})){
   if(/learning_material_legacy_links|ccp_legacy_material_bridge_change|material-legacy-bridge|LegacyMaterialBridge|ccp_material_legacy_bridge_/i.test(source))
     errors.push(label+": obsolete material compatibility bridge detected");
 }
 if(/DATA_EXPORT_VERSION|(?:^|\n)\s*version:\s*(?:number|[0-9])|raw\.version|backup\.version/i.test(transfer))
   errors.push("Current teacher backup must not have format-version negotiation");
 if(/chess_learning_resources/i.test(sql))
   errors.push("Independent URL material catalog prohibited; use material_links → learning_materials");
 if(/CREATE TABLE\s+(?:public\.)?chess_material_progress\s*\(/i.test(sql))
   errors.push("Duplicate material evidence ledger forbidden; use material_teaching_evidence");
 if(strictMaterials&&/chess_learning_resources|chess_material_progress\s*\(/i.test(sql))
   errors.push("Canonical typed-material gate requires removal of the separate learning-resource catalog and progress writer");
 if(/"version"\s*:\s*backup\.version|\bversion\s*:\s*1\s*,\s*exportedAt/.test(transfer))
   errors.push("Current teacher backup must reject any versioned format");
 return errors;
}

export function repositoryInputs(){
 const sqlFiles=readdirSync(join(root,"supabase/migrations")).filter(x=>x.endsWith(".sql")).sort();
 const checks={
   sqlFiles,sql:sqlFiles.includes(BASELINE)?read("supabase/migrations/"+BASELINE):"",
   migrationManifest:JSON.parse(read("scripts/schema-transition-manifest.json")),
   transitionSources:Object.fromEntries(sqlFiles.filter(x=>x!==BASELINE).map(file=>
     [file,read("supabase/migrations/"+file)])),
   transfer:read("lib/data-transfer.ts"),
   agent:read("lib/server/agent-tools.ts"),
   catalog:read("scripts/mcp-website-parity.json"),
   studentPage:read("app/(teacher)/students/[id]/page.tsx"),
   teacherComponents:readdirSync(join(root,"components/teacher")).join("\n"),
 };
 return checks;
}
export function checkRepository(){
 return canonicalSchemaErrors(repositoryInputs());
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const errors=process.argv.includes("--strict-materials")?
   canonicalSchemaErrors({...repositoryInputs(),strictMaterials:true}):checkRepository();
 if(errors.length){for(const e of errors)console.error("ADR-0001: "+e);process.exitCode=1;}
 else console.log("ADR-0001/0015 canonical baseline, reviewed transition hashes and backup contract verified.");
}
