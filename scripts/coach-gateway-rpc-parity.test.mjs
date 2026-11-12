import {readFileSync} from "node:fs";
import {join,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {test} from "node:test";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(join(root,path),"utf8");
const web=read("app/api/agent/v1/route.ts");
const mcp=read("lib/server/agent-tools.ts");
const coach=read("lib/server/coach-service.ts");
const schema=read("supabase/migrations/20261107000000_chesscoachpal_baseline.sql");

test("teacher website core profile edits and delegated MCP use exactly one SQL writer",()=>{
 for(const [op,tool] of [
  ["students.update","ccp_v1_students_update"],
  ["workplaces.update","ccp_v1_workplaces_update"],
  ["groups.update","ccp_v1_groups_update"],
 ]){
  const action=op.replace(".","\\.");
  const route=new RegExp('case "'+action+'":[\\s\\S]*?case "');
  const extracted=web.match(route)?.[0];
  assert.ok(extracted,"Missing website business route "+op);
  assert.ok(extracted.includes('writeRevisionedCoaching(db,"'+op+'"'),
   op+" must call same SQL writer as OAuth MCP");
  assert.ok(extracted.includes("expectedUpdatedAt:call.expectedUpdatedAt")&&
    extracted.includes("idempotencyKey:call.idempotencyKey"),
    op+" must supply explicit requested revision and retry UUID");
  assert.ok(mcp.includes(tool+':"'+op+'"'),
    tool+" must map to the same current transaction operation");
 }
 for(const exportName of ["studentsUpdate","workplacesUpdate","groupsUpdate"])
  assert.ok(!new RegExp('export async function '+exportName+'\\(').test(coach),
   "A duplicate direct PostgREST writer survived: "+exportName);
});
test("browser↔MCP same-key replays cannot disagree merely because clientId differs",()=>{
 const func=schema.slice(schema.indexOf("CREATE OR REPLACE FUNCTION public.agent_coaching_mutate("));
 assert.ok(func.includes("p_client_id text"),"Keep provenance and client audit");
 assert.ok(func.includes("p_client_id:=")||func.includes("p_client_id"),
  "Client audit field must remain");
 assert.match(func,/v_hash\s*:=\s*md5\(jsonb_build_array\(p_operation,p_payload,p_expected_updated_at\)::text\)/,
  "Receipt hash must compare the business operation and terms, NOT caller identity");
 assert.ok(!/v_hash\s*:=\s*md5\(jsonb_build_array\([^;]*p_client_id/.test(func),
  "Transport must not be a component of cross-interface replay identity");
});
