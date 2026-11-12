import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {validateGatewayActionE2E} from "./mcp-gateway-evidence.mjs";
import {validateLegacyActionCoverage,legacyActionTools} from "./mcp-legacy-actions.mjs";
const gateway=readFileSync(new URL("../app/api/agent/v1/route.ts",import.meta.url),"utf8");
const catalogue=readFileSync(new URL("../lib/server/agent-tools.ts",import.meta.url),"utf8");
test("every current domain action has a registered MCP tool or reviewed teacher browser exception",()=>{
  assert.equal(Object.keys(legacyActionTools).length,38);
  assert.deepEqual(validateLegacyActionCoverage(gateway,catalogue),[]);
});
test("a new website gateway action without MCP coverage cannot pass",()=>{
  const edited=gateway.replace(/action\s*:\s*z\.literal\("workplaces.list"\)/,
    'action:z.literal("unreviewed.action")');
  assert.match(validateLegacyActionCoverage(edited,catalogue).join("\n"),/Unreviewed legacy website action/);
});
test("a renamed or deleted MCP tool cannot silently satisfy domain route parity",()=>{
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


test("all 38 gateway actions have real per-action website/delegated MCP E2E evidence",()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
 const report=validateGatewayActionE2E(root);
 assert.equal(report.actions,38);
 assert.deepEqual(report.errors,[]);
 assert.equal(report.evidence.size,38);
 for(const [action,paths] of report.evidence){
  assert.ok(paths.length>0,"Missing named behavioral evidence for "+action);
  assert.ok(paths.every(path=>path.startsWith("e2e/")&&path.includes("#PARITY:PARITY-")));
 }
});

test("a paired gateway test name without a real delegated MCP invocation cannot count",()=>{
 const root=mkdtempSync(join(tmpdir(),"ccp-gateway-audit-"));
 try{
  mkdirSync(join(root,"e2e"));
  const file=join(root,"e2e","synthetic.spec.ts");
  const browserOnly=`test("PARITY:PARITY-synthetic-unpaired",async({page})=>{
    await page.request.post("/api/agent/v1",{data:{action:"workplaces.list"}});
    const label="ccp_v1_workplaces_list";
    expect(label).toContain("workplaces");
  });`;
  writeFileSync(file,browserOnly);
  const missing=validateGatewayActionE2E(root);
  assert.ok(missing.errors.some(line=>line.includes("workplaces.list")));
  const pair=browserOnly.replace(
   'const label="ccp_v1_workplaces_list";',
   'const response=await call("ccp_v1_workplaces_list",{});');
  writeFileSync(file,pair);
  const valid=validateGatewayActionE2E(root);
  assert.ok(!valid.errors.some(line=>line.includes("workplaces.list")));
  assert.equal(valid.errors.length,missing.errors.length-1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("browser-only teacher attestation does not become an unreviewed bearer bypass",()=>{
 const root=mkdtempSync(join(tmpdir(),"ccp-gateway-browser-"));
 try{
  mkdirSync(join(root,"e2e"));
  const file=join(root,"e2e","synthetic.spec.ts");
  const scenario=`test("PARITY:PARITY-bearer-verification-denied",async({page,request})=>{
    await request.post("/api/agent/v1",{
      headers:{Authorization:"Bearer synthetic"},
      data:{action:"chess.observations.approve",observationId:"uuid"}
    });
    expect(result.status()).toBe(403);
  });`;
  writeFileSync(file,scenario);
  const missing=validateGatewayActionE2E(root);
  assert.ok(missing.errors.some(line=>line.includes("chess.observations.approve")));
  writeFileSync(file,scenario.replace('expect(result.status()).toBe(403);',
   'expect(result.status()).toBe(403); expect(result.error).toBe("BROWSER_APPROVAL_REQUIRED");'));
  const approved=validateGatewayActionE2E(root);
  assert.ok(!approved.errors.some(line=>line.includes("chess.observations.approve")));
 }finally{rmSync(root,{recursive:true,force:true});}
});
