#!/usr/bin/env node
/**
 * ADR-0017 FINAL RELEASE gate (deliberately not part of the interim WIP CI):
 * no pre-v1 compatibility model may survive the one coordinated cutover.
 * This is a source audit, not a substitute for real tenant, token, import and
 * delegated MCP E2E tests. Invoke before accepting/archiving the OpenSpecs.
 */
import {existsSync,readdirSync,readFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const BASELINE="20261107000000_chesscoachpal_baseline.sql";
const LEGACY_TABLE=/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?(?:guardians|studio_policies)"?\s*\(/gi;
const FRESH_CONTACT=/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?(?:contacts|student_contacts|billing_accounts)"?\s*\(/gi;
const PORTAL_GRANT=/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?(?:portal_grants|portal_access_grants|student_portal_grants)"?\s*\(/i;
const LEGACY_ROUTES=[
 "app/(teacher)/families", "app/(teacher)/studio", "app/api/guardians",
 "app/api/families", "app/api/studio",
];
const LEGACY_RUNTIME=/\bguardian_id\b|\bstudio_policies\b|\.from\(["'`]guardians["'`]\)/gi;
const LEGACY_MCP=/\bccp_(?:guardians|families|studio)_[a-z\d_]+\b/gi;

/** Accepts in-memory inputs so CI tests can verify the scanner without wiping anything. */
export function finalCutoverIssues({baseline,migrationFiles,paths,runtimeSources,catalog}) {
 const issues=[];
 const migrations=[...migrationFiles].sort();
 if(migrations.length!==1||migrations[0]!==BASELINE)
   issues.push(`Release SQL directory must contain only final canonical baseline; found ${migrations.length} SQL files: ${migrations.join(", ")}`);
 const oldTables=[...baseline.matchAll(LEGACY_TABLE)].length;
 if(oldTables)issues.push(`Final baseline still creates ${oldTables} inherited guardian/studio tables`);
 if(/\bguardian_id\b|\bstudio_policies\b/i.test(baseline))
   issues.push("Final baseline still uses old guardian_id/studio_policies names");
 const canonical=[...baseline.matchAll(FRESH_CONTACT)].map(m=>m[0].match(/(?:contacts|student_contacts|billing_accounts)/)?.[0]);
 for(const name of ["contacts","student_contacts","billing_accounts"])
   if(!canonical.includes(name))issues.push(`Final baseline missing ${name} table`);
 if(!PORTAL_GRANT.test(baseline))issues.push("Final baseline missing explicit scoped portal grants table");
 for(const route of LEGACY_ROUTES)if(paths.includes(route)||paths.some(p=>p.startsWith(route+"/")))
   issues.push(`Obsolete Family/Studio/guardian route remains: ${route}`);
 for(const [file,source] of Object.entries(runtimeSources)) {
   const matches=[...source.matchAll(LEGACY_RUNTIME)];
   if(matches.length)issues.push(`${file} has ${matches.length} references to legacy guardian_id/studio_policies/guardians storage`);
 }
 const legacyTools=[...catalog.matchAll(LEGACY_MCP)].map(m=>m[0]);
 if(legacyTools.length)issues.push(`${legacyTools.length} obsolete Family/Studio/guardian MCP tool references remain`);
 return issues;
}
function walk(dir,relDir="",result=[]) {
 if(!existsSync(dir))return result;
 for(const ent of readdirSync(dir,{withFileTypes:true})){
   const p=join(dir,ent.name),rel=join(relDir,ent.name).replaceAll("\\","/");
   if(ent.isDirectory())walk(p,rel,result);
   else if(ent.isFile()&&/\.[cm]?[jt]sx?$/.test(ent.name)&&
     !/\.(?:test|spec)\.[jt]sx?$/.test(ent.name))result.push(rel);
 }
 return result;
}
export function repositoryCutoverIssues(projectRoot=root){
 const basePath=join(projectRoot,"supabase/migrations");
 const migrationFiles=existsSync(basePath)?readdirSync(basePath).filter(f=>f.endsWith(".sql")):[];
 const baselinePath=join(basePath,BASELINE);
 const baseline=existsSync(baselinePath)?readFileSync(baselinePath,"utf8"):"";
 const sourcePaths=[...walk(join(projectRoot,"app"),"app"),...walk(join(projectRoot,"components"),"components"),...walk(join(projectRoot,"lib"),"lib")];
 const runtimeSources=Object.fromEntries(sourcePaths.map(file=>[file,readFileSync(join(projectRoot,file),"utf8")]));
 const routes=[...LEGACY_ROUTES].filter(p=>existsSync(join(projectRoot,p)));
 const catalogPath=join(projectRoot,"scripts/mcp-website-parity.json");
 return finalCutoverIssues({baseline,migrationFiles,paths:routes,runtimeSources,
   catalog:existsSync(catalogPath)?readFileSync(catalogPath,"utf8"):""});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const issues=repositoryCutoverIssues();
 if(issues.length){
   console.error(`ADR-0017 final cutover NOT READY (${issues.length} violations). First 30:`);
   for(const issue of issues.slice(0,30))console.error(`- ${issue}`);
   if(issues.length>30)console.error(`... and ${issues.length-30} more`);
   process.exitCode=1;
 } else console.log("ADR-0017 final pre-v1 current-baseline/no-compatibility source audit passed. Run live E2E and operator cutover checks separately.");
}
