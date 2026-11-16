#!/usr/bin/env node
/**
 * Hardcoded UI text inventory. An explicit debt baseline protects existing
 * translations from regressions without pretending legacy literals are gone.
 * Updating the baseline requires conscious code review; delete entries as
 * screens move to next-intl. Machine IDs and authored user data are excluded.
 */
import ts from "typescript";
import {readFileSync,writeFileSync,readdirSync,existsSync} from "node:fs";
import {resolve,relative,join} from "node:path";

const root=resolve(import.meta.dirname,"..");
const baselinePath=join(root,"scripts/i18n-hardcoded-baseline.json");
const update=process.argv.includes("--update-baseline");
const attrs=new Set(["aria-label","aria-description","aria-placeholder","placeholder","title","alt","label"]);
const normalize=value=>value.replace(/\s+/g," ").trim();
function isHuman(value){
  // Do not report whitespace, numbers, or purely notation and code symbols.
  return /[a-zA-Z]{2,}/.test(value) && value.length>=3;
}
function candidate(value,found){
  const normalized=normalize(value);
  if(isHuman(normalized))found.add(normalized);
}
function readJsxExpression(e,found){
  if(!e)return;
  if(ts.isStringLiteral(e)||ts.isNoSubstitutionTemplateLiteral(e))candidate(e.text,found);
  else if(ts.isConditionalExpression(e)){
    readJsxExpression(e.whenTrue,found);readJsxExpression(e.whenFalse,found);
  }else if(ts.isParenthesizedExpression(e))readJsxExpression(e.expression,found);
}
function collect(path){
  const code=readFileSync(path,"utf8");
  const source=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const found=new Set();
  const visit=node=>{
    if(ts.isJsxText(node))candidate(node.getText(source),found);
    if(ts.isJsxAttribute(node)&&attrs.has(node.name.text)){
      if(node.initializer&&ts.isStringLiteral(node.initializer)){
        candidate(node.initializer.text,found);
      }else if(node.initializer&&ts.isJsxExpression(node.initializer)){
        readJsxExpression(node.initializer.expression,found);
      }
    }
    if(ts.isJsxExpression(node))readJsxExpression(node.expression,found);
    ts.forEachChild(node,visit);
  };
  visit(source);
  return [...found].sort();
}
function walk(dir){
  if(!existsSync(dir))return [];
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const path=join(dir,entry.name);
    if(entry.isDirectory())return walk(path);
    return entry.isFile()&&path.endsWith(".tsx")?[path]:[];
  });
}
const files=[...walk(join(root,"app")),...walk(join(root,"components"))].sort();
const current=Object.fromEntries(files.map(path=>[relative(root,path).replaceAll("\\","/"),collect(path)]).filter(([,labels])=>labels.length));
if(update){
  writeFileSync(baselinePath,JSON.stringify(current,null,2)+"\n");
  console.log("Updated reviewed literal-debt inventory:",Object.keys(current).length,"files,",
    Object.values(current).reduce((sum,l)=>sum+l.length,0),"UI strings");
}else{
  if(!existsSync(baselinePath))throw new Error("Run --update-baseline and review all UI debt before enforcing");
  const previous=JSON.parse(readFileSync(baselinePath,"utf8"));
  const violations=Object.entries(current).flatMap(([file,strings])=>{
    const before=new Set(previous[file]??[]);
    return strings.filter(s=>!before.has(s)).map(s=>file+": "+s.slice(0,150));
  });
  console.log("UI literal debt:",Object.keys(current).length,"files,",
    Object.values(current).reduce((sum,l)=>sum+l.length,0),"English strings remaining.");
  if(violations.length){
    console.error("New hardcoded UI strings (use next-intl, do not silently refresh baseline):\n"+violations.join("\n"));
    process.exitCode=1;
  }else console.log("No new hardcoded UI text relative to reviewed migration baseline.");
}
