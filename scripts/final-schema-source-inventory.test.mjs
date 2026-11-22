import {test} from "node:test";
import {strict as assert} from "node:assert";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

test("final-schema inventory is exhaustive, deterministic and RLS complete",()=>{
 const raw=execFileSync(process.execPath,[
  new URL("./final-schema-source-inventory.mjs",import.meta.url).pathname,
  "--json","--strict",
 ],{encoding:"utf8"});
 const report=JSON.parse(raw);
 const sql=readFileSync(new URL("../supabase/migrations/20261107000000_chesscoachpal_baseline.sql",import.meta.url),"utf8");
 assert.equal(report.sha256,createHash("sha256").update(sql).digest("hex"));
 assert.equal(report.source_only,true);
 assert.equal(report.table_count,report.tables.length);
 assert.equal(report.typed_count+report.untyped_count,report.table_count);
 assert.deepEqual(report.rls_missing,[]);
 assert.deepEqual(report.unreviewed_type_ownership,[]);
 assert.deepEqual(report.stale_internal_ownership,[]);
 assert.equal(report.internal_sql_only_count,report.untyped_count);
 assert.equal(new Set(report.tables.map(t=>t.table)).size,report.table_count);
 for(const row of report.tables){
  assert.ok(row.table.length>0);
  assert.equal(row.column_count,row.columns.length);
  assert.ok(row.column_count>0,"no columns extracted for "+row.table);
 }
});

test("every declared typed table Row covers the canonical CREATE TABLE columns",()=>{
 const report=JSON.parse(execFileSync(process.execPath,[
  new URL("./final-schema-source-inventory.mjs",import.meta.url).pathname,
  "--json","--strict",
 ],{encoding:"utf8"}));
 const source=readFileSync(new URL("../lib/supabase/types.ts",import.meta.url),"utf8");
 for(const row of report.tables.filter(t=>t.type_ownership==="declared")){
  const match=new RegExp("^\\s{6}"+row.table+
   ":\\s*\\{\\s*Row:\\s*\\{([\\s\\S]*?)\\}\\s*;","m").exec(source);
  assert.ok(match,"missing Row contract for "+row.table);
  const known=new Set([...match[1].matchAll(/(?:^|[;\n])\s*([a-z_][a-z0-9_]*):\s*/gm)]
   .map(m=>m[1]));
  for(const column of row.columns)
   assert.ok(known.has(column),"missing "+row.table+"."+column+" in typed Row");
 }
});
