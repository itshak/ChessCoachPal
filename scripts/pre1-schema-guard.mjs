#!/usr/bin/env node
/**
 * ADR-0001 mechanical fresh-install contract. This guards against changes
 * reintroducing schema upgrade chains, material compatibility mapping or
 * data-export version negotiation. It does not replace live tenant/RLS tests.
 */
import {readdirSync,readFileSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(join(root,path),"utf8");

export function canonicalSchemaErrors({
 sqlFiles,sql,transfer,agent,catalog,studentPage,teacherComponents,strictMaterials=false,
}){
 const errors=[];
 if(sqlFiles.length!==1||sqlFiles[0]!=="20261107000000_chesscoachpal_baseline.sql")
   errors.push("One canonical fresh-install SQL snapshot is required; no incremental migrations");
 if(!sql.includes("CREATE TABLE public.learning_materials")||
    !sql.includes("CREATE TABLE public.student_training_plans"))
   errors.push("Canonical snapshot is missing required current typed chess tables");
 for(const [label,source] of Object.entries({sql,transfer,agent,catalog,studentPage,teacherComponents})){
   if(/learning_material_legacy_links|ccp_legacy_material_bridge_change|material-legacy-bridge|LegacyMaterialBridge|ccp_v1_material_legacy_bridge_/i.test(source))
     errors.push(label+": obsolete material compatibility bridge detected");
 }
 if(/DATA_EXPORT_VERSION|(?:^|\n)\s*version:\s*(?:number|[0-9])|raw\.version|backup\.version/i.test(transfer))
   errors.push("Current teacher backup must not have format-version negotiation");
 if(strictMaterials&&/chess_learning_resources|chess_material_progress\s*\(/i.test(sql))
   errors.push("Canonical typed-material gate requires removal of the separate learning-resource catalog and progress writer");
 if(/"version"\s*:\s*backup\.version|\bversion\s*:\s*1\s*,\s*exportedAt/.test(transfer))
   errors.push("Current teacher backup must reject any versioned format");
 return errors;
}

export function repositoryInputs(){
 const sqlFiles=readdirSync(join(root,"supabase/migrations")).filter(x=>x.endsWith(".sql")).sort();
 const checks={
   sqlFiles,sql:sqlFiles.length===1?read("supabase/migrations/"+sqlFiles[0]):"",
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
 else console.log("ADR-0001 fresh-install schema and current backup shape verified.");
}
