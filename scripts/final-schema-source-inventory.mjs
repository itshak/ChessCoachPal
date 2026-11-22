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
// Explicit ownership for SQL-only relations. These are intentionally omitted from
// the browser's manually maintained Supabase Tables contract: access is through
// server RPCs, SECURITY DEFINER functions, or internal worker/service paths.
// Any new untyped relation must be reviewed and added here, or typed explicitly.
const internalSqlOnly=new Set([
 "agent_oauth_clients","agent_oauth_codes","agent_oauth_grants","agent_tool_receipts",
 "chess_skill_categories","skill_assessments","skill_dimensions","material_links",
 "chess_games","chess_puzzles","chess_drills","chess_study_chapters",
 "learning_material_relations","training_assignments","assignment_attempts",
 "assignment_reviews","teacher_spreadsheet_import_receipts","event_email_deliveries",
 "student_chess_profile_history","chess_material_defaults","chess_material_default_history",
 "ccp_credit_redemption_return_receipts","session_roster_corrections",
 "skill_assessment_write_receipts","teacher_lichess_connections",
 "teacher_lichess_connection_events","lichess_puzzle_publications",
 "teacher_backup_import_receipts","ccp_event_request_receipts",
 "ccp_student_create_receipts","learning_material_edit_receipts",
 "learning_material_relation_receipts","learning_material_lifecycle_receipts",
 "student_training_plans","student_training_plan_revisions",
 "student_training_plan_receipts","skill_dimension_create_receipts",
 "ccp_delivery_outbox","ccp_session_note_audit","ccp_session_attendance_audit",
 "teacher_study_chapter_index","lichess_puzzle_series","teacher_study_preferences",
 "ccp_historical_attendance_evidence","ccp_historical_import_stages",
]);
const rows=names.map(name=>{
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 const rls=new RegExp('ALTER\\s+TABLE\\s+(?:"public"|public)\\.(?:"'+escaped+'"|'+escaped+')\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY','i').test(sql);
 const tableStart=new RegExp('CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"public"|public)\\.(?:"'+escaped+'"|'+escaped+')\\s*\\(','i').exec(sql);
 const section=tableStart?sql.slice(tableStart.index,sql.indexOf(";",tableStart.index)+1):"";
 const declaredColumns=[...section.matchAll(/^\s*(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+"?(uuid|text|integer|bigint|boolean|numeric|date|timestamptz|timestamp|jsonb|json|smallint|time|character varying|double precision|real)\b/gim)]
  .map(m=>m[1]??m[2]);
 const typed=new RegExp('^\\s{6}'+escaped+':\\s*\\{','m').test(types);
 return {table:name,column_count:declaredColumns.length,columns:declaredColumns,rls_enabled:rls,typescript_contract:typed,
  type_ownership:typed?"declared":internalSqlOnly.has(name)?"internal_sql_only":"unreviewed"};
});
const inventory={
 source:"supabase/migrations/20261107000000_chesscoachpal_baseline.sql",
 sha256:createHash("sha256").update(sql).digest("hex"),
 source_only:true,
 table_count:rows.length,
 typed_count:rows.filter(r=>r.typescript_contract).length,
 untyped_count:rows.filter(r=>!r.typescript_contract).length,
 internal_sql_only_count:rows.filter(r=>r.type_ownership==="internal_sql_only").length,
 unreviewed_type_ownership:rows.filter(r=>r.type_ownership==="unreviewed").map(r=>r.table),
 stale_internal_ownership:[...internalSqlOnly].filter(n=>!names.includes(n)||rows.find(r=>r.table===n)?.typescript_contract),
 rls_missing:rows.filter(r=>!r.rls_enabled).map(r=>r.table),
 tables:rows,
};
if(process.argv.includes("--strict")){
 if(inventory.rls_missing.length)throw new Error("RLS missing: "+inventory.rls_missing.join(", "));
 if(inventory.unreviewed_type_ownership.length)throw new Error("Unreviewed type ownership: "+inventory.unreviewed_type_ownership.join(", "));
 if(inventory.stale_internal_ownership.length)throw new Error("Stale internal ownership: "+inventory.stale_internal_ownership.join(", "));
}
if(process.argv.includes("--json"))process.stdout.write(JSON.stringify(inventory,null,2)+"\n");
else{
 process.stdout.write("Canonical SQL "+inventory.sha256+"\n");
 process.stdout.write("Tables "+inventory.table_count+"; typed "+inventory.typed_count+"; untyped "+inventory.untyped_count+"; RLS missing "+inventory.rls_missing.length+"\n");
 for(const row of rows)process.stdout.write([row.table,row.rls_enabled?"RLS":"NO_RLS",row.type_ownership].join("\t")+"\n");
}
