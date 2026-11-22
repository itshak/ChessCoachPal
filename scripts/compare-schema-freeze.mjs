#!/usr/bin/env node
/**
 * Source/target schema-freeze comparison. NEVER connects to a database.
 *
 * Input: two independently exported structural snapshots in the format below.
 * Export snapshots with scripts/schema-freeze-metadata.sql using a read-only
 * transaction on the authorized source and target. Do not commit snapshots
 * containing operational identifiers, comments or data.
 *
 * Usage: node scripts/compare-schema-freeze.mjs source.json target.json
 * Exit 0 only for exact structural equality; exit 1 for a difference.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const REQUIRED=["tables","columns","constraints","indexes","triggers","policies","functions","grants","sequences","types","extensions"];
const keyFor={
 tables:["schema","name"],
 columns:["schema","table","name"],
 constraints:["schema","table","name"],
 indexes:["schema","table","name"],
 triggers:["schema","table","name"],
 policies:["schema","table","name"],
 functions:["schema","identity"],
 grants:["schema","object_kind","object_identity","grantee","privilege"],
 sequences:["schema","name"],
 types:["schema","name"],
 extensions:["name"],
};
const allowed=new Set(REQUIRED);
function parse(path){
 const raw=JSON.parse(readFileSync(resolve(path),"utf8"));
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Snapshot must be an object");
 for(const section of REQUIRED){
  if(!Array.isArray(raw[section]))throw new Error("Missing array: "+section);
  const keys=keyFor[section];
  const seen=new Set();
  for(const item of raw[section]){
   if(!item||typeof item!=="object"||Array.isArray(item))throw new Error(section+" item must be an object");
   for(const k of keys)if(typeof item[k]!=="string"||!item[k])
    throw new Error(section+" item missing identity: "+k);
   const id=JSON.stringify(keys.map(k=>item[k]));
   if(seen.has(id))throw new Error("Duplicate "+section+" identity "+id);
   seen.add(id);
  }
 }
 for(const section of Object.keys(raw))if(!allowed.has(section))
  throw new Error("Unknown snapshot section: "+section);
 return raw;
}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==="object")
  return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
   .map(([k,v])=>[k,canonical(v)]));
 return value;
}
function compare(source,target){
 const differences=[];
 for(const section of REQUIRED){
  const keys=keyFor[section];
  const index=rows=>new Map(rows.map(row=>[JSON.stringify(keys.map(k=>row[k])),JSON.stringify(canonical(row))]));
  const before=index(source[section]),after=index(target[section]);
  for(const [id,value] of before){
   if(!after.has(id))differences.push({section,id,change:"missing_in_target"});
   else if(after.get(id)!==value)differences.push({section,id,change:"definition_mismatch"});
  }
  for(const id of after.keys())if(!before.has(id))
   differences.push({section,id,change:"unexpected_in_target"});
 }
 return differences.sort((a,b)=>a.section.localeCompare(b.section)||a.id.localeCompare(b.id)||a.change.localeCompare(b.change));
}
if(process.argv.length!==4){
 process.stderr.write("Usage: node scripts/compare-schema-freeze.mjs source.json target.json\n");
 process.exitCode=2;
}else{
 try{
  const differences=compare(parse(process.argv[2]),parse(process.argv[3]));
  process.stdout.write(JSON.stringify({equal:differences.length===0,differences},null,2)+"\n");
  if(differences.length)process.exitCode=1;
 }catch(error){
  process.stderr.write(String(error)+"\n");
  process.exitCode=2;
 }
}
