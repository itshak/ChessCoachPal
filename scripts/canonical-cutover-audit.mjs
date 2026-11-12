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
  if(new RegExp('\¶»§q«^