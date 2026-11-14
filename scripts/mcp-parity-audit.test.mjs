import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...args) => spawnSync(process.execPath, ["scripts/mcp-parity-audit.mjs", ...args], {
  cwd: root, encoding: "utf8", timeout: 30000,
});

test("ordinary inventory keeps its structural floor alongside complete behavior acceptance", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /NOT equivalent to verified behavior/);
  assert.match(result.stdout, /93\/93 verified, 0 not yet checked/);
  // Additional independently tested workflows grow this matrix over time.
  // Never pin acceptance to a historical count or weaken the all-checked gate.
  // The original floor is retained while new cases must still be 100% signed off.
  const cases = /New canonical parity workflows: (\\d+)\\/(\\d+) verified/.exec(result.stdout);
  assert.ok(cases, "canonical scenario acceptance summary must be present");
  assert.equal(cases[1], cases[2], "every enumerated scenario must be independently accepted");
  assert.ok(Number(cases[1]) >= 26, "the original canonical acceptance floor must remain");
  assert.doesNotMatch(result.stdout, /Release BLOCKED:/);
});

test("strict release gate accepts all evidenced teacher surfaces, not only tool names", () => {
  const result = run("--strict");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /strict parity holds for inventoried routes and historical behavior cases/);
  assert.doesNotMatch(result.stderr, /Strict MCP-first parity gate failed/);
});


import {teacherDomainParityErrors} from "./mcp-parity-domain-guard.mjs";

test("shared domain contract rejects an MCP-invisible new website operation",()=>{
  const web='import {teacherStudentsList,teacherStudentsUnsafeEdit} from "@/lib/server/student-profile-service";';
  const mcp='import {teacherStudentsList} from "@/lib/server/student-profile-service";';
  const errors=teacherDomainParityErrors("app/api/students/route.ts",web,mcp);
  assert.match(errors.join("\n"),/teacherStudentsUnsafeEdit.*lacks matching MCP import/);
});

test("shared domain contract accepts matching actions, but rejects a route with no shared service",()=>{
  const web='import {teacherStudentsList} from "@/lib/server/student-profile-service";';
  const mcp='import {teacherStudentsList} from "@/lib/server/student-profile-service";';
  assert.deepEqual(teacherDomainParityErrors("app/api/students/route.ts",web,mcp),[]);
  assert.match(teacherDomainParityErrors("app/api/students/route.ts",web,"").join("\n"),/lacks a shared/);
});

test("model-safe teacher export is a reviewed narrow privacy exception",()=>{
  const web='import {teacherExport} from "@/lib/server/teacher-transfer-service";';
  const mcp='import {teacherSafeExport} from "@/lib/server/teacher-transfer-service";';
  assert.deepEqual(teacherDomainParityErrors("app/api/settings/export/route.ts",web,mcp),[]);
});
