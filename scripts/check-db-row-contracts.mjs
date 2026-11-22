#!/usr/bin/env node
/**
 * Compare manually maintained Supabase Row contracts to columns materialized
 * from a disposable instance of the canonical baseline. This does not inspect
 * data or certify insert/update policy, constraints, or full type generation.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const textTypes=new Set(["text","character varying","character","varchar","uuid","date","time",
 "time without time zone","time with time zone","timestamp","timestamp with time zone",
 "timestamp without time zone","timestamptz","citext","inet","cidr","macaddr","bytea","interval","name"]);
const numberTypes=new Set(["smallint","integer","bigint","numeric","decimal","real","double precision","oid"]);
function wireType(name,typeNames) {
 const format=name.toLowerCase().replace(/\([^)]*\)/g,"").replace(/\s+/g," ").trim();
 if(format.endsWith("[]"))return "array";
 if(textTypes.has(format)||typeNames.has(format)||typeNames.has(format.replace(/^public\./,"")))return "string";
 if(numberTypes.has(format))return "number";
 if(format==="boolean")return "boolean";
 if(format==="json"||format==="jsonb")return "json";
 return null;
}
function property(checker,type,name,at) {
 const p=checker.getPropertyOfType(type,name);
 if(!p)throw new Error("Missing TypeScript contract member: "+name);
 return checker.getTypeOfSymbolAtLocation(p,p.valueDeclaration??at);
}
function members(type) {return type.isUnion()?type.types:[type];}
function scalarKind(checker,type) {
 if(type.flags&ts.TypeFlags.StringLike)return "string";
 if(type.flags&ts.TypeFlags.NumberLike)return "number";
 if(type.flags&ts.TypeFlags.BooleanLike)return "boolean";
 if(type.flags&ts.TypeFlags.Null)return "null";
 if(type.flags&ts.TypeFlags.Undefined)return "undefined";
 if(checker.isArrayType(type)||checker.isTupleType(type))return "array";
 return "other";
}
export function compareRowContracts(path,snapshot) {
 if(!Array.isArray(snapshot?.columns)||snapshot.columns.length===0)throw new Error("Nonempty catalog columns required");
 const program=ts.createProgram({rootNames:[path],options:{strict:true,noEmit:true,skipLibCheck:true,types:[]}});
 const source=program.getSourceFile(path);
 if(!source)throw new Error("Cannot load TypeScript contract: "+path);
 const declaration=source.statements.find(node=>ts.isInterfaceDeclaration(node)&&node.name.text==="Database");
 if(!declaration)throw new Error("Database interface not found");
 const checker=program.getTypeChecker();
 const publicSchema=property(checker,checker.getTypeAtLocation(declaration),"public",declaration);
 const tables=property(checker,publicSchema,"Tables",declaration);
 const issues=[],seen=new Set(),columnIndex=new Map();
 const types=new Set((snapshot.types??[]).filter(t=>t.schema==="public"&&t.kind==="e").map(t=>t.name.toLowerCase()));
 for(const col of snapshot.columns) {
  if(col.schema!=="public")continue;
  if(typeof col.table!=="string"||!col.table||typeof col.name!=="string"||!col.name||
    typeof col.data_type!=="string"||typeof col.not_null!=="boolean")throw new Error("Malformed catalog column");
  const key=col.table+"\u0000"+col.name;
  if(seen.has(key))throw new Error("Duplicate catalog column "+col.table+"."+col.name);
  seen.add(key);
  if(!columnIndex.has(col.table))columnIndex.set(col.table,new Map());
  columnIndex.get(col.table).set(col.name,col);
 }
 let typedTables=0,checkedColumns=0;
 for(const exposed of checker.getPropertiesOfType(tables)) {
  const t=exposed.name,catalog=columnIndex.get(t);
  typedTables++;
  if(!catalog){issues.push({table:t,kind:"table_missing_in_database"});continue;}
  const row=property(checker,checker.getTypeOfSymbolAtLocation(exposed,exposed.valueDeclaration??declaration),"Row",declaration);
  const declared=new Map(checker.getPropertiesOfType(row).map(sym=>[sym.name,sym]));
  for(const [name,col] of catalog) {
   const sym=declared.get(name),table=t;
   checkedColumns++;
   if(!sym){issues.push({table,name,kind:"column_missing_in_types"});continue;}
   const actual=members(checker.getTypeOfSymbolAtLocation(sym,sym.valueDeclaration??declaration))
    .map(type=>scalarKind(checker,type));
   const found=[...new Set(actual)].sort();
   const expected=wireType(col.data_type,types);
   if(!expected){issues.push({table,name,kind:"unsupported_column_type",sql:col.data_type});continue;}
   if(found.includes("undefined")||(sym.flags&ts.SymbolFlags.Optional))
    issues.push({table,name,kind:"row_property_optional",actual:found});
   // A SQL NOT NULL jsonb column may legally contain JSON literal null. Its
   // row value may intentionally use a narrower JSON document contract.
   if(expected==="json")continue;
   if(!found.includes(expected)||found.some(kind=>kind!=="null"&&kind!=="undefined"&&kind!==expected))
    issues.push({table,name,kind:"wire_type",sql:col.data_type,expected,actual:found});
   if(found.includes("null")===col.not_null)
    issues.push({table,name,kind:"nullability",databaseNullable:!col.not_null,typescriptNullable:found.includes("null")});
  }
  for(const name of declared.keys())if(!catalog.has(name))issues.push({table:t,name,kind:"column_missing_in_database"});
 }
 return {typedTables,checkedColumns,issues};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
 try {
  if(process.argv.length!==3)throw new Error("Usage: node scripts/check-db-row-contracts.mjs SNAPSHOT_JSON");
  const result=compareRowContracts(fileURLToPath(new URL("../lib/supabase/types.ts",import.meta.url)),
   JSON.parse(readFileSync(resolve(process.argv[2]),"utf8")));
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(result.issues.length)process.exitCode=1;
 }catch(error){
  process.stderr.write(error.message+"\n");process.exitCode=2;
 }
}
