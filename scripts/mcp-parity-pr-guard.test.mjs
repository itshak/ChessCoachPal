import { test } from "node:test";
import assert from "node:assert/strict";
import { parityChangeViolations } from "./mcp-parity-pr-guard.mjs";

const route = "app/api/coaching/report/route.ts";
const catalogue = "lib/server/agent-tools.ts";
const registry = "scripts/mcp-website-parity.json";
const testFile = "e2e/agent-mcp.spec.ts";

test("documentation changes do not invoke teacher feature gate", () => {
  assert.deepEqual(parityChangeViolations(["docs/STATUS.md"]), []);
});
test("teacher API changes without MCP, registry, E2E fail", () => {
  assert.equal(parityChangeViolations([route]).length, 3);
});
test("teacher component feature changes require same parity deltas", () => {
  assert.equal(parityChangeViolations(["components/teacher/StudentInfoCard.tsx"]).length, 3);
});
test("required MCP, registry and E2E paths satisfy structural PR gate", () => {
  assert.deepEqual(parityChangeViolations([route, catalogue, registry, testFile]), []);
  assert.equal(parityChangeViolations([route, catalogue, testFile]).length, 1);
});
test("system webhook is not teacher MCP route", () => {
  assert.deepEqual(parityChangeViolations(["app/api/webhooks/stripe/[teacherId]/route.ts"]), []);
});
