#!/usr/bin/env node
/**
 * Source-level unresolved cutover inventory for ADR-0005. This does not
 * certify behavioral parity; --strict is for the completed release gate.
 */
import {readFileSync,readdirSync} from "node:fs";
import {resolve,join,relative,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const sqlPath="supabase/migrations/20261107000000_chesscoachpal_baseline.sql";
const oldTables=["lessons","attendance","lesson_notes"];
const oldRpcs=["ccp_calendar_attendance_commit","ccp_portal_cancel_lesson","ccp_calendar_slot_delete"];
const targets=["app","components","lib","supabase","scripts"];
const sourceExt=/\.(?:ts|tsx|js|mjs|sql)$/;

export function physicalLegacyTableDefinitions(sql){
 return oldTables.filter(table=>new RegExp(
  'CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:(?:"?public"?\\.)?)"?'+table+'"?(?:\\s|\\n)*\\(',"i"
 ).test(sql));
}
export function directOldSourceReferences(source){
 const matches=[];
 for(const table of oldTables){
  const quoted='(?:["\\x27]'+table+'["\\x27])';
  const db=new RegExp('\\.from\\s*\\(\\s*'+quoted+'\\s*\\)',"g");
  if(db.test(source))matches.push("PostgREST "+table);
  const sql=new RegExp('\\b(?:FROM|JOIN|UPDATE|INTO|REFERENCES|ALTER\\s+TABLE|CREATE\\s+TABLE|DELETE\\s+FROM|ON)\\s+(?:(?:"?public"?\\.)?)"?'+table+'"?(?=\\s|\\.|\\()',"gi");
  if(sql.test(source))matches.push("SQL "+table);
 }
 for(const rpc of oldRpcs)
  if(new RegExp('\\b'+rpc+'\\b',"i").test(source))matches.push("RPC "+rpc);
 return matches;
}
function walk(dir){
 const files=[];
 for(const ent of readdirSync(dir,{withFileTypes:true})){
  if(ent.name==="node_modules"||ent.name===".git"||ent.name===".next")continue;
  const full=join(dir,ent.name);
  if(ent.isDirectory())files.push(...walk(full));
  else if(ent.isFile()&&sourceExt.test(ent.name))files.push(full);
 }
 return files;
}
export function inventory(){
 const sql=readFileSync(join(root,sqlPath),"utf8");
 const files=[];
 for(const folder of targets)
  for(const abs of walk(join(root,folder))){
   const path=relative(root,abs).replaceAll("\\","/");
   if(path===sqlPath || path==="scripts/canonical-cutover-audit.mjs" || path==="scripts/canonical-cutover-audit.test.mjs")continue;
   const references=directOldSourceReferences(readFileSync(abs,"utf8")).filter(x=>path.endsWith(".sql")||!x.startsWith("SQL "));
   if(references.length)files.push({path,references,kind:/\.(?:test|spec)\.|^e2e\//.test(path)?"test":"runtime"});
  }
 files.sort((a,b)=>a.path.localeCompare(b.path));
 return {physicalTables:physicalLegacyTableDefinitions(sql),sqlPath,
  sqlReferences:directOldSourceReferences(sql),consumers:files,oldRpcs};
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const audit=inventory(),runtime=audit.consumers.filter(x=>x.kind==="runtime");
 const tests=audit.consumers.filter(x=>x.kind==="test");
 if(process.argv.includes("--json"))console.log(JSON.stringify(audit,null,2));
 else{
  console.log("Canonical attendance cutover: "+audit.physicalTables.length+" old physical tables; "+
   runtime.length+" source consumers; "+tests.length+" tests/fixtures.");
  for(const entry of runtime)console.log(" - "+entry.path+": "+entry.references.join(", "));
 }
 if(process.argv.includes("--strict")&&
    (audit.physicalTables.length||audit.sqlReferences.length||audit.consumers.length))
   process.exitCode=1;
}

