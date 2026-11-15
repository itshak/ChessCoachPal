#!/usr/bin/env node
/**
 * Safety gate: a Supabase db push may never infer local/remote selection from
 * an implicit CLI default or a previously linked project.
 */
import {readFileSync,readdirSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

export function unsafeMigrationPushes(source,file="input"){
 const errors=[];
 const lines=source.split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
   const line=lines[i].trim();
   if(line.startsWith("#")||line.startsWith("//"))continue;
   const match=line.match(/(?:^|[;&|\s])(?:npx\s+)?supabase\s+db\s+push\b/);
   if(!match)continue;
   const command=lines.slice(i,i+4).join(" ").split(/\s+(?:&&|;|\|\|)\s+/)[0];
   if(!/(?:^|\s)--(?:remote|local)(?:\s|$)/.test(command))
     errors.push(`${file}:${i+1}: Supabase db push must specify --remote or --local`);
   if(/--remote\b/.test(command)&&
      !/SUPABASE_PROJECT_REF/.test(source))
     errors.push(`${file}:${i+1}: remote migrations need explicit SUPABASE_PROJECT_REF verification`);
 }
 return errors;
}

function filesIn(path){
 return readdirSync(path,{withFileTypes:true}).flatMap(entry=>
   entry.isDirectory()?filesIn(join(path,entry.name)):[join(path,entry.name)]);
}
export function auditRepository(root){
 const files=[...filesIn(join(root,".github/workflows")),...filesIn(join(root,"scripts")),...filesIn(join(root,"docker"))]
   .filter(file=>/\.(?:yml|yaml|sh|mjs|bash)$/.test(file));
 return files.flatMap(file=>unsafeMigrationPushes(readFileSync(file,"utf8"),file.slice(root.length+1)));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const errors=auditRepository(resolve(dirname(fileURLToPath(import.meta.url)),".."));
 if(errors.length){errors.forEach(error=>console.error(error));process.exitCode=1;}
 else console.log("Supabase migration target explicitness verified: no unscoped db push.");
}
