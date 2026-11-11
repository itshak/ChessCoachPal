import {test} from "node:test";
import {deepStrictEqual,ok} from "node:assert/strict";
import {canonicalSchemaErrors,checkRepository} from "./pre1-schema-guard.mjs";
const clean={
 sqlFiles:["20261107000000_chesscoachpal_baseline.sql"],
 sql:"CREATE TABLE public.learning_materials (id uuid); CREATE TABLE public.student_training_plans(id uuid);",
 transfer:"export function buildCurrentTeacherBackup() {return {tables:{}};}",
 agent:"const tools=[];",catalog:"{}",studentPage:"export default function Page(){}",
 teacherComponents:"LearningMaterialsCatalog.tsx",
};
test("ADR-0001: current source has one installation schema and no format adapter",()=>{
 deepStrictEqual(checkRepository(),[]);
});
test("ADR-0001: rejects incremental upgrade files",()=>{
 ok(canonicalSchemaErrors({...clean,sqlFiles:[...clean.sqlFiles,"new_patch.sql"]}).length>0);
});
test("ADR-0001: rejects previous-material mapping in schema, MCP or UI",()=>{
 for(const prop of ["sql","agent","catalog","studentPage","teacherComponents"]){
  ok(canonicalSchemaErrors({...clean,[prop]:clean[prop]+" ccp_v1_material_legacy_bridge_list"}).length>0,prop);
 }
});
test("ADR-0001: rejects backup-format version negotiation",()=>{
 ok(canonicalSchemaErrors({...clean,transfer:"const DATA_EXPORT_VERSION=2;"}).length>0);
 ok(canonicalSchemaErrors({...clean,transfer:"if(raw.version!==2) return null;"}).length>0);
});

test("ADR-0001 strict release gate blocks separate resource/material catalog",()=>{
 const sql=clean.sql+" CREATE TABLE public.chess_learning_resources (id uuid);";
 const errors=canonicalSchemaErrors({...clean,sql,strictMaterials:true});
 ok(errors.some(x=>x.includes("separate learning-resource catalog")));
 deepStrictEqual(canonicalSchemaErrors({...clean,strictMaterials:true}),[]);
});

test("ADR-0001: duplicate resource-keyed history tables are not part of current schema",()=>{
 const errors=canonicalSchemaErrors({...clean,sql:clean.sql+" CREATE TABLE public.chess_material_progress (id uuid);"});
 ok(errors.some(e=>e.includes("Duplicate material evidence ledger")));
});

test("ADR-0001: reject an independent material URL catalog in the canonical SQL",()=>{
 const sql=clean.sql+" CREATE TABLE public.chess_learning_resources (id uuid);";
 const failures=canonicalSchemaErrors({...clean,sql});
 ok(failures.some(e=>e.includes("Independent URL material catalog")));
});
