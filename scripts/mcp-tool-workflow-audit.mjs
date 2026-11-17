#!/usr/bin/env node
/**
 * Auditable current MCP registry. Static analysis, no auth/network/LLM/DB.
 * Print / regenerate the inventory using: node scripts/mcp-tool-workflow-audit.mjs --write
 */
import ts from "typescript";
import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

const root=resolve(import.meta.dirname,"..");
const sourcePath=resolve(root,"lib/server/agent-tools.ts");
const source=readFileSync(sourcePath,"utf8");
const parsed=ts.createSourceFile(sourcePath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const prop=(obj,name)=>obj.properties.find(p=>ts.isPropertyAssignment(p)&&p.name?.getText(parsed).replaceAll(/["']/g,"")===name)?.initializer;
const string=node=>(node&&(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)))?node.text:null;
let catalogue;
function visit(node){
 if(ts.isVariableDeclaration(node)&&node.name.getText(parsed)==="catalogue"){
  const init=node.initializer;
  catalogue=ts.isAsExpression(init)?init.expression:init;
 }
 ts.forEachChild(node,visit);
}
visit(parsed);
if(!catalogue||!ts.isArrayLiteralExpression(catalogue))throw Error("Missing tool catalogue AST");
const routes=JSON.parse(readFileSync(resolve(root,"scripts/mcp-website-parity.json"),"utf8"));
const declared=routes.apiRoutes.flatMap(r=>(r.existingTools??[]).map(name=>({name,route:r.path})));
const byTool=new Map();
for(const r of declared){
 const old=byTool.get(r.name)??[];
 old.push(r.route);
 byTool.set(r.name,old);
}
function category(name){
 const parts=name.replace(/^ccp_/,"").split("_");
 if(parts[0]==="learning"&&parts[1]==="materials")return "materials";
 if(parts[0]==="historical")return "historical";
 if(parts[0]==="settings"||parts[0]==="import")return "import/export/settings";
 if(parts[0]==="billing"||parts[0]==="credits")return "finance";
 return parts[0];
}
function classify(name){
 if(/(_preview|_commit_with_|_briefing|_aggregate|_summary|_bulk_|_dates_commit|_export_csv)/.test(name))
  return ["KEEP/COMPOSE","Already expresses a review, aggregate or multi-step outcome; confirm backend transaction and receipts."];
 if(/(_create|_update|_edit|_delete|_void|_record|_set|_unlink|_lifecycle_change|_correct)$/.test(name))
  return ["GRANULAR-ONLY","Preserve precise authorized record-level mutation; evaluate as part of a higher-level coaching journey."];
 return ["KEEP","Keep independently discoverable; inspect description and exact task selection."];
}
const tools=catalogue.elements.map(n=>{
 if(!ts.isObjectLiteralExpression(n))throw Error("Unexpected tool expression");
 const name=string(prop(n,"name"));
 const description=string(prop(n,"description"));
 const scope=string(prop(n,"scope"));
 const ro=prop(n,"readOnly")?.kind===ts.SyntaxKind.TrueKeyword;
 const schema=prop(n,"schema")?.getText(parsed);
 if(!name||description===null||!scope||!schema)throw Error("Static tool field missing");
 const [classification,rationale]=classify(name);
 return {name,description,scope,readOnly:ro,domain:category(name),schemaExpression:schema,
  dispatch:source.includes('case "'+name+'"')||source.includes("case '"+name+"'")||source.includes(name+":"),
  routes:byTool.get(name)??[], classification,rationale};
});
const errors=[];
const names=new Set();
for(const t of tools){
 if(names.has(t.name))errors.push("Duplicate "+t.name);
 names.add(t.name);
 if(!/^ccp_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(t.name))errors.push("Invalid tool name "+t.name);
 if(t.description.trim().length<30)errors.push("Too vague/short: "+t.name);
 if(t.description.length>850)errors.push("Long context-heavy description: "+t.name+" ("+t.description.length+")");
 if(!["coach:read","coach:write"].includes(t.scope))errors.push("Unknown scope "+t.name);
 // Two teacher-approved external reads are intentionally non-readOnly: they
 // contact Lichess/Chess.com or an external vision AI, despite coach:read scope.
 const externalRead=new Set(["ccp_student_ratings_refresh_preview","ccp_lichess_image_fen_propose"]);
 if(t.readOnly!==(t.scope==="coach:read")&&!externalRead.has(t.name))
  errors.push("Read/write scope mismatch "+t.name);
 if(!t.dispatch)errors.push("No obvious dispatcher "+t.name);
}
const out={head:"Generated current-source audit (run script after each catalog change; source of truth is agent-tools.ts)",count:tools.length,generatedFrom:"lib/server/agent-tools.ts",tools};
if(process.argv.includes("--json"))process.stdout.write(JSON.stringify(out,null,2)+"\n");
if(process.argv.includes("--write")){
 const lines=["# ChessCoachPal MCP tool and coaching-workflow audit",
 "",
 "> Generated from the actual typed source catalog with `node scripts/mcp-tool-workflow-audit.mjs --write`. Classifications are **initial engineering dispositions** to review during this OpenSpec; not claims that each tool has undergone live-model testing. Do not replace the current full tool surface with this document.",
 "",
 "## Baseline",
 "",
 "- Tools: **"+tools.length+"** (count at current source, not a version-pinned policy).",
 "- Full browser↔MCP parity remains required; exact scope/entitlement and domain-service wiring must be verified in the implementation.",
 "- Quality check: `npm run mcp:catalog:quality` (static names/description/dispatch). Tool counts and total schema bytes are diagnostic; not optimization targets.",
 "",
 "## Teacher intents before endpoints",
 "",
 "| Intent | Existing safe client sequence (examples) | Desired composition | Status |",
 "| --- | --- | --- | --- |",
 "| Completed group lesson with each pupil's note | `ccp_lessons_capture_preview` → `ccp_sessions_ad_hoc_create` → `ccp_sessions_details` → `ccp_sessions_complete` | Preview → atomic scheduled-create+completion with explicitly recorded frozen-roster attendance and distinct participant notes | Implementation target |",
 "| Use a newly created drill or study material in one completed lesson | `ccp_learning_materials_list` → `ccp_learning_materials_create` → `ccp_material_links_create` → one `ccp_materials_history_record` per pupil | Safe preview → one transaction creating/reusing material, lesson association and per-pupil evidence, not mastery | Implementation target |",
 "| Pre-lesson individual briefing | `ccp_coach_briefing_get` | Reuse the existing bounded multi-source briefing; no duplicate command | Existing |",
 "| Record verified historical attendance dates | `ccp_historical_attendance_dates_preview` → `ccp_historical_attendance_dates_commit` | Preserve PR #95's review/commit; **never create calendar sessions** | Existing |",
 "| Import aggregate/absent historical records | `ccp_historical_attendance_preview` → `ccp_historical_attendance_commit` | Preserve advanced mapped/staged workflows and safeguards | Existing |",
 "| Export full teacher data | `ccp_settings_export_csv` per table with safe paging, or website ZIP | Preserve privacy-filtered pages and JSON restore as distinct | Existing |",
 "| Correct one attendance/learning record | Existing exact revision-guarded update/void tools | Preserve granular editing and history/audit; compound correction only if justified | Existing |",
 "| Track workplace teaching time | `ccp_reports_workplace_summary` | Reuse authoritative teacher-time aggregation (group counted once) | Existing |",
 "| Invoices/communications | Existing preview → explicit confirmed send/record | Separate external effects; never fold automatic messages/payments into lesson capture | Existing |",
 "",
 "## Full discovered tool catalogue",
 "",
 "| Tool | Domain | OAuth | Initial disposition | Description chars | Website routes |",
 "| --- | --- | --- | --- | ---: | --- |",
 ...tools.map(t=>`| \`${t.name}\` | ${t.domain} | ${t.scope} | ${t.classification} | ${t.description.length} | ${t.routes.length} |`),
 "",
 "## Distinctions requiring human review",
 "",
 "- A tool namespace is **not** an MCP subgroup and does not automatically defer model-context loading; client-native progressive discovery controls model exposure.",
 "- Do not add a generic executor. Typed high-level operations are additional named tools backed by the same owner-scoped domain services; all granular field-level tools remain callable.",
 "- PR #95 separates source-neutral presence-date evidence, advanced historical import and student/family spreadsheet import. Do not conflate any of these with a scheduled lesson.",
 "- CSV pages are for an explicitly requested data export; never load the complete archive to answer a normal coaching question. CSV is not the restore format.",
 "- Read-only preview must not claim persistence; confirmation and idempotent commit must preserve tenant, timezone, evidence and retry rules.",
 "- Name/description-only metadata checks are not model-completion benchmarks. Run exact real-client acceptance separately when required.",
 ""];
 writeFileSync(resolve(root,"docs/MCP_TOOL_WORKFLOW_AUDIT.md"),lines.join("\n"),"utf8");
 console.log("Wrote auditable inventory of "+tools.length+" tools.");
}
if(errors.length){for(const e of errors)console.error(e);process.exitCode=1;}
else console.log("MCP catalog quality passed for "+tools.length+" tools.");
