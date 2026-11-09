import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateLegacyActionCoverage,legacyActionTools} from "./mcp-legacy-actions.mjs";
const gateway=readFileSync(new URL("../app/api/agent/v1/route.ts",import.meta.url),"utf8");
const catalogue=readFileSync(new URL("../lib/server/agent-tools.ts",import.meta.url),"utf8");
test("every legacy business action has a registered MCP tool or reviewed teacher browser exception",()=>{
  assert.equal(Object.keys(legacyActionTools).length,35);
  assert.deepEqual(validateLegacyActionCoverage(gateway,catalogue),[]);
});
test("a new website gateway action without MCP coverage cannot pass",()=>{
  const edited=gateway.replace(/action\s*:\s*z\.literal\("workplaces.list"\)/,
    'action:z.literal("unreviewed.action")');
  assert.match(validateLegacyActionCoverage(edited,catalogue).join("\n"),/Unreviewed legacy website action/);
});
test("a renamed or deleted MCP tool cannot silently satisfy legacy route parity",()=>{
  const edited=catalogue.replace('name: "ccp_v1_workplaces_list"',
    'name: "ccp_v1_missing_workplaces_list"');
  assert.match(validateLegacyActionCoverage(gateway,edited).join("\n"),/Missing registered MCP tool/);
});
test("teacher approval cannot be turned into a non-browser business exception",()=>{
  const edited=gateway.replace('call.action==="chess.observations.approve"',
    'call.action==="unreviewed.non_browser"');
  assert.match(validateLegacyActionCoverage(edited,catalogue).join("\n"),
    /browser exception lacks bearer guard/);
});
