import {readFileSync} from "node:fs";
import {join,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {describe,it} from "node:test";
import assert from "node:assert/strict";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(join(root,path),"utf8");

describe("website ↔ MCP ordinary studio policy field parity",()=>{
 it("enumerates every supported website policy field in the MCP patch schema",()=>{
  const source=read("lib/server/teacher-policy-service.ts");
  const catalogue=read("lib/server/agent-tools.ts");
  const service=source.match(/const allowed=new Set\(\[([\s\S]*?)\]\);/);
  const mcp=catalogue.match(/const studioPolicyPatch=z\.object\(\{([\s\S]*?)\}\)\.strict\(\);/);
  assert.ok(service,"Could not inspect the website policy allowlist");
  assert.ok(mcp,"Could not inspect the MCP studioPolicyPatch schema");
  const supported=[...service[1].matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map(m=>m[1]);
  const accepted=[...mcp[1].matchAll(/\b([A-Za-z][A-Za-z0-9]*):z\./g)].map(m=>m[1]);
  // Credentials must be entered in an authenticated SECURE BROWSER form;
  // their null/reset controls and all ordinary metadata must remain in MCP.
  const browserOnly=new Set(["aiApiKey","stripeSecretKey","stripePublishableKey",
   "stripeWebhookSecret"]);
  assert.equal(new Set(supported).size,supported.length,"Website allowlist has duplicate fields");
  assert.equal(new Set(accepted).size,accepted.length,"MCP studio patch has duplicate fields");
  assert.ok(supported.every(key=>!browserOnly.has(key)||!accepted.includes(key)));
  assert.deepEqual(accepted.slice().sort(),
   supported.filter(key=>!browserOnly.has(key)).sort(),
   "Every non-secret supported website policy key needs one MCP schema entry");
  for(const key of ["clearAiApiKey","clearStripeSecretKey","clearStripePublishableKey",
    "clearStripeWebhookSecret","paymentQrCode","paymentProvider"]){
   assert.ok(accepted.includes(key),"Missing safe MCP field "+key);
  }
 });
});
