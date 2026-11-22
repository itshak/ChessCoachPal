import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {compareRowContracts} from "./check-db-row-contracts.mjs";

const column=(name,data_type,not_null)=>({schema:"public",table:"observations",name,data_type,not_null});
function fixture(t,row){
 const dir=mkdtempSync(join(tmpdir(),"ccp-row-contract-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,"types.ts");
 writeFileSync(path,`export type Status="open"|"closed";
 export type WireJson = number | null | string | WireJson[] | {[key:string]:WireJson};
 export interface Database {public:{Tables:{observations:{Row:{${row}}}}}}`);
 return path;
}
test("database row type families, enum aliases and nullable arrays match",t=>{
 const path=fixture(t,"id:string; status:Status; tags:string[]|null; body:WireJson");
 const snap={
  columns:[column("id","uuid",true),column("status","public.status",true),
   column("tags","text[]",false),column("body","jsonb",true)],
  types:[{schema:"public",name:"status",kind:"e"}],
 };
 assert.deepEqual(compareRowContracts(path,snap),{typedTables:1,checkedColumns:4,issues:[]});
});
test("materialized nullability, wire type, required shape and legacy fields are distinguished",t=>{
 const path=fixture(t,"nullable:string; count:boolean; wrongOptional?:string; obsolete:string");
 const snap={columns:[column("nullable","text",false),column("count","numeric(12,2)",true),
  column("wrongOptional","timestamp(3) with time zone",true),column("added","boolean",true)]};
 const result=compareRowContracts(path,snap);
 assert.deepEqual(result.issues.map(x=>[x.name,x.kind]),[
  ["nullable","nullability"],["count","wire_type"],["wrongOptional","row_property_optional"],
  ["added","column_missing_in_types"],["obsolete","column_missing_in_database"],
 ]);
});
test("invalid and duplicate catalog inputs do not pass",t=>{
 const path=fixture(t,"id:string");
 assert.throws(()=>compareRowContracts(path,{columns:[]}),/Nonempty/);
 const item=column("id","uuid",true);
 assert.throws(()=>compareRowContracts(path,{columns:[item,item]}),/Duplicate/);
});
