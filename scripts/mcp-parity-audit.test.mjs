import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (...args) => spawnSync(process.execPath, ["scripts/mcp-parity-audit.mjs", ...args], {
  cwd: root, encoding: "utf8", timeout: 30000,
});

test("ordinary source inventory is valid but does not certify parity", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /NOT equivalent to verified behavior/);
  assert.match(result.stdout, /Release BLOCKED:/);
});

test("strict release gate rejects incomplete teacher parity and unsigned cases", () => {
  const result = run("--strict");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Strict MCP-first parity gate failed/);
  assert.match(result.stderr, /unchecked browser\/MCP behavior scenarios/);
});
