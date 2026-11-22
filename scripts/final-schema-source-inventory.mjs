#!/usr/bin/env node
/**
 * Read-only source inventory for the single pre-v1 canonical baseline.
 * This does not claim equivalence with a privately deployed database.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const sql=readFileSync(new URL("../supabase/migrations/20261107000000_chesscoachpal_baseline.sql",import.meta.url),"utf8");
const types=readFileSync(new URL("../lib/supabase/types.ts",import.meta.url),"utf8");
const names=[...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"|public)\.(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*\(/gi)]
 .map(m=>m[1]??m[2]).sort();
const duplicate=names.filter((n,i)=>names.indexOf(n)!==i);
if(duplicate.length)throw new Error("Duplicate CREATE TABLE: "+duplicate.join(", "));
const rows=names.map(name=>{
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 const rls=new RegExp('ALTER\\s+TABLE\\s+(?:"public"|public)\\.(?:"'+escaped+'"|'+escaped+')\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY','i').test(sql);
 const tableStart=new RegExp('CREATE\\\\s+TABLE\\\\s+(?:IF\\\\s+NOT\\\\s+EXISTS\\\\s+)?(?:"public"|public)\\\\.(?:"'+escaped+'"|'+escaped+')\\\\s*\\\\(','i').exec(sql);
 const section=tableStart?sql.slice(tableStart.index,sql.indexOf(";",tableStart.index)+1):"";
 const declaredColumns=[...section.matchAll(/^\\s*(?:"([^"]+)"|([a-z_][a-z0-9_]*))\\s+(uuid|text|integer|bigint|boolean|numeric|date|timestamptz|timestamp|jsonb|json|smallint|time|character varying|double precision|real)\\b/gim)]
  .map(m=>m[1]??m[2]);
 const typed=new RegExp('^\\s{6}'+escaped+':\\s*\\{','m').test(types);
 return {table:name,column_count:declaredColumns.length,columns:declaredColumns,rls_enabled:rls,typescript_contract:typed,
  type_ownership:typed?"declared":"not_declared_review_required"};
});
const inventory={
 source:"supabase/migrations/20261107000000_chesscoachpal_baseline.sql",
 sha256:createHash("sha256").update(sql).digest("hex"),
 source_only:true,
 table_count:rows.length,
 typed_count:rows.filter(r=>r.typescript_contract).length,
 untyped_count:rows.filter(r=>!r.typescript_contract).length,
 rls_missing:rows.filter(r=>!r.rls_enabled).map(r=>r.table),
 tables:rows,
};
if(process.argv.includes("--strict") && inventory.rls_missing.length)
 throw new Error("RLS missing: "+inventory.rls_missing.join(", "));
if(process.argv.includes("--json"))process.stdout.write(JSON.stringify(inventory,null,2)+"\n");
else{
 process.stdout.write("Canonical SQL "+inventory.sha256+"\n");
 process.stdout.write("Tables "+inventory.table_count+"; typed "+inventory.typed_count+"; untyped "+inventory.untyped_count+"; RLS missing "+inventory.rls_missing.length+"\n");
 for(const row of rows)process.stdout.write([row.table,row.rls_enabled?"RLS":"NO_RLS",row.type_ownership].join("\t")+"\n");
}
