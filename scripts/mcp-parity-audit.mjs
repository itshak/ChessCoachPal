#!/usr/bin/env node
// ChessCoachPal MCP-first parity inventory: source-verifiable, reviewable,
// intentionally non-strict during implementation. Strict mode blocks release.
// This tests enumeration/tool claims, NOT a full authenticated browser/MCP E2E.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCheckedParityRow, validateUniqueCheckedParityReferences } from "./parity-evidence.mjs";
import { validateLegacyActionCoverage } from "./mcp-legacy-actions.mjs";
import { validateGatewayActionE2E } from "./mcp-gateway-evidence.mjs";
import { canonicalOccurrenceSchemaErrors } from "./canonical-lessons-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inventory = JSON.parse(readFileSync(join(root, "scripts/mcp-website-parity.json"), "utf8"));
const errors = [];
// A fresh-install/current-contract inventory has no schema or compatibility version.
if (Object.prototype.hasOwnProperty.call(inventory, "version"))
  errors.push("Parity inventory must describe only the current contract, without a format version");
const assert = (ok, msg) => { if (!ok) errors.push(msg); };
const filesUnder = (folder, predicate) => {
  const output = [];
  const scan = (absolute) => {
    if (!existsSync(absolute)) return;
    for (const ent of readdirSync(absolute, {withFileTypes:true})) {
      const path = join(absolute, ent.name);
      if (ent.isDirectory()) scan(path);
      else if (ent.isFile()) {
        const rel = relative(root, path).replaceAll("\\","/");
        if (predicate(rel)) output.push(rel);
      }
    }
  };
  scan(join(root, folder));
  return output.sort();
};
const same = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const allApi = filesUnder("app/api", p => p.endsWith("/route.ts"));
const allPages = filesUnder("app/(teacher)", p => p.endsWith("/page.tsx"));
const allComponents = filesUnder("components/teacher", p => p.endsWith(".tsx"));
const verifyCoverage = (label, actual, declared) => {
  assert(new Set(declared).size===declared.length, label+": duplicate declared paths");
  const x = actual.filter(p=>!declared.includes(p));
  const y = declared.filter(p=>!actual.includes(p));
  assert(x.length===0,label+": new/unreviewed files: "+x.join(", "));
  assert(y.length===0,label+": missing/stale files: "+y.join(", "));
};
verifyCoverage("API routes",allApi,inventory.apiRoutes.map(r=>r.path));
verifyCoverage("teacher pages",allPages,inventory.teacherPages);
verifyCoverage("teacher components",allComponents,inventory.teacherComponents);

const knownKinds = new Set(["teacher","auth","ui","external","system"]);
const knownParities = new Set(["mcp","partial","gap","browser-only","not-applicable"]);
const registeredTools = readFileSync(join(root,"lib/server/agent-tools.ts"),"utf8");
const liveNames = new Set([...registeredTools.matchAll(/\bname\s*:\s*["'](ccp_v1_[a-z0-9_]+)["']/g)].map(m=>m[1]));
errors.push(...validateLegacyActionCoverage(
  readFileSync(join(root,"app/api/agent/v1/route.ts"),"utf8"), registeredTools));
const gatewayEvidence=validateGatewayActionE2E(root);
errors.push(...gatewayEvidence.errors);
console.log("Legacy gateway exact action evidence:",gatewayEvidence.actions,
  "website actions with direct executable E2E,",
  gatewayEvidence.evidence.size,"evidenced,",gatewayEvidence.errors.length,"missing");
for (const route of inventory.apiRoutes) {
  assert(knownKinds.has(route.kind),route.path+": invalid classification");
  assert(knownParities.has(route.parity),route.path+": invalid parity status");
  assert(route.explanation && route.explanation.length>12,route.path+": missing justification");
  const source = readFileSync(join(root,route.path),"utf8");
  const methods = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(m=>m[1]);
  assert(same(methods,route.methods),route.path+": HTTP methods changed; actual="+methods.join(",")+" expected="+route.methods.join(","));
  for (const t of route.existingTools) assert(liveNames.has(t),route.path+": claimed MCP tool does not exist: "+t);
  if (route.parity==="mcp") {
    assert(route.existingTools.length>0,route.path+": cannot mark MCP complete without current tool");
    assert(typeof route.evidenceTest==="string" && route.evidenceTest.startsWith("e2e/") &&
      route.evidenceTest.endsWith(".spec.ts") && existsSync(join(root,route.evidenceTest)),
      route.path+": marked MCP-complete without executable authenticated E2E reference");
    if (typeof route.evidenceTest==="string" && existsSync(join(root,route.evidenceTest))) {
      if(route.path==="app/api/agent/v1/route.ts"){
        // Unlike a simple endpoint, this gateway multiplexes 36 MCP actions
        // plus two narrowly reviewed browser provenance approvals. Its proof
        // is the audited per-action named E2E matrix across multiple files.
        // Do not demand all tools appear in one single test file: demand
        // separately paired real website and delegated MCP tests instead.
        assert(gatewayEvidence.errors.length===0,
          route.path+": cannot be complete until every action is independently evidenced");
      }else{
        const testSource=readFileSync(join(root,route.evidenceTest),"utf8");
        for (const toolName of route.existingTools)
          assert(testSource.includes(toolName),route.path+": E2E reference does not name live tool "+toolName);
      }
    }
  }
  // Every teacher-business route now has an MCP tool counterpart, even if
  // its behavior remains unverified. Make this structural floor mandatory
  // in ordinary CI so no future website feature can be MCP-invisible.
  if (route.kind==="teacher") assert(route.existingTools.length>0,
    route.path+": MCP-first invariant broken: teacher route has no registered MCP tool");
  if (route.kind==="teacher") assert(["mcp","partial","gap"].includes(route.parity),
    route.path+": user-facing business route needs direct MCP parity (a secure exception must be individually reviewed, not hidden)");
  if (route.kind==="system"||route.kind==="external"||route.kind==="ui") assert(route.parity==="not-applicable",
    route.path+": non-teacher system route misclassified");
  if (route.parity==="gap"||route.parity==="partial") assert(route.explanation.length>20,route.path+": gap needs reason");
}
assert(inventory.apiRoutes.length>50 && inventory.teacherPages.length>10 && inventory.teacherComponents.length>40,
  "Inventory unexpectedly small; check against actual source files");
assert(liveNames.size>=28,"MCP tool catalogue unexpectedly shrank: "+liveNames.size);
const outstanding=inventory.apiRoutes.filter(r=>r.kind==="teacher"&&r.parity!=="mcp");
const gap=outstanding.filter(r=>r.parity==="gap").length, partial=outstanding.filter(r=>r.parity==="partial").length;
const secure=inventory.apiRoutes.filter(r=>r.parity==="browser-only").length;
const teacherRoutes=inventory.apiRoutes.filter(r=>r.kind==="teacher");
console.log("MCP endpoint catalogue floor: "+teacherRoutes.filter(r=>r.existingTools.length>0).length+
  "/"+teacherRoutes.length+" teacher-business route families have named MCP tools (NOT equivalent to verified behavior).");
console.log("MCP-first source inventory: "+allApi.length+" API routes, "+allPages.length+" teacher pages, "+allComponents.length+" teacher components, "+liveNames.size+" live MCP tools.");
console.log("Teacher-business endpoint parity: "+(inventory.apiRoutes.filter(r=>r.kind==="teacher").length-outstanding.length)+" complete / "+partial+" partial / "+gap+" missing; "+secure+" browser-only auth/hosted flows.");
if (outstanding.length>0) {
  console.log("Release BLOCKED: "+outstanding.length+" teacher-business route surfaces still lack verified full MCP parity.");
  for (const r of outstanding) console.log("  "+r.parity+" "+r.path+": "+r.explanation);
}
const checklist=readFileSync(join(root,"docs/MCP_WEBSITE_PARITY_CHECKLIST.md"),"utf8");
const cases=[...checklist.matchAll(/^\|\s*-\s*\[([ xX])\]\s*\|/gm)];
assert(cases.length===93,"Parity checklist expected exactly 93 behavioral scenarios; found "+cases.length);
// One checked scenario needs one named test that exercises both interfaces.
// The E2E job must actually execute those tests before a release is accepted.
const checklistRows=checklist.split("\n").filter(line=>/^\|\s*-\s*\[[ xX]\]\s*\|/.test(line));
for (const [index,row] of checklistRows.entries()) {
  if (!/^\|\s*-\s*\[[xX]\]/.test(row)) continue;
  for (const message of validateCheckedParityRow(row,index+1,
    path => existsSync(join(root,path)),
    path => readFileSync(join(root,path),"utf8"))) errors.push(message);
}
// New canonical workflows are a distinct, growable matrix. The baseline remains
// exactly 93 named cases; never hide regressions by renumbering that inventory.
const nextMatrix=readFileSync(join(root,"docs/MCP_NEW_PARITY_SCENARIOS.md"),"utf8");
const nextRows=nextMatrix.split("\n").filter(line=>/^\|\s*-\s*\[[ xX]\]\s*\|/.test(line));
assert(nextRows.length>=1,"New chess-first parity matrix must contain independently named cases");
for(const [index,row] of nextRows.entries()){
 if(!/^\|\s*-\s*\[[xX]\]/.test(row))continue;
 for(const message of validateCheckedParityRow(row,index+1,
  path=>existsSync(join(root,path)),
  path=>readFileSync(join(root,path),"utf8")))errors.push(message);
}
errors.push(...validateUniqueCheckedParityReferences([...checklistRows,...nextRows]));
const pendingCases=cases.filter(match=>match[1]===" ").length;
const pendingNewCases=nextRows.filter(x=>/^\\|\\s*-\\s*\\[ \\]/.test(x)).length;
console.log("New canonical parity workflows: "+(nextRows.length-pendingNewCases)+"/"+nextRows.length+" verified.");
if(pendingNewCases>0) console.log("Release BLOCKED: "+pendingNewCases+" new website/MCP scenarios still unverified.");
console.log("Browser ↔ MCP behavioral checklist: "+(cases.length-pendingCases)+"/"+cases.length+
  " verified, "+pendingCases+" not yet checked.");
if(pendingCases>0){
  // A route catalogue can be 100% covered and still lack signed-off behavior.
  // Normal CI validates inventory structure, but must never imply that strict
  // website/MCP release parity holds before all historical cases pass.
  console.log("Release BLOCKED: "+pendingCases+
    " historical website/MCP behavior cases remain unsigned.");
}
// A matching tool and a unified read model are not enough while two
// independently writable actual-lesson/attendance schemas remain deployed.
const occurrenceErrors=canonicalOccurrenceSchemaErrors(readFileSync(
  join(root, "supabase/migrations/20261107000000_chesscoachpal_baseline.sql"),"utf8"
));
for(const message of occurrenceErrors)
  console.log("Release BLOCKED: canonical occurrence schema: "+message);
if (process.argv.includes("--strict")) {
  for(const message of occurrenceErrors)
    errors.push("Strict MCP-first parity gate failed: "+message);
  if (outstanding.length>0)
    errors.push("Strict MCP-first parity gate failed: "+outstanding.length+" teacher-business route surfaces incomplete.");
  if (pendingCases>0)
    errors.push("Strict MCP-first parity gate failed: "+pendingCases+" unchecked browser/MCP behavior scenarios.");
  if (pendingNewCases>0)
    errors.push("Strict MCP-first parity gate failed: "+pendingNewCases+" unchecked new website/MCP scenarios.");
}
if (errors.length) {
  for (const e of errors) console.error("ERROR: "+e);
  process.exitCode=1;
} else {
  console.log("Inventory structure and live tool-name references verified"+
    (outstanding.length||pendingCases||occurrenceErrors.length
      ?" (release functionality parity is NOT complete)"
      :"; strict parity holds for inventoried routes and historical behavior cases")+".");
}
