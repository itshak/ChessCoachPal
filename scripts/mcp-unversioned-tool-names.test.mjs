import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const currentToolNames = readFileSync(join(root, "lib/server/agent-tools.ts"), "utf8");
const legacyToolPattern = new RegExp("ccp_v" + "[0-9]+_");
const extensions = /\.(?:ts|tsx|js|mjs|json|sh|yml|yaml)$/;

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes:true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile() && extensions.test(entry.name)) yield path;
  }
}

test("published MCP catalogue uses one unversioned ccp_ tool contract", () => {
  const names = [...currentToolNames.matchAll(/name:\s*"(ccp_[a-z0-9_]+)"/g)].map(match => match[1]);
  assert.ok(names.length >= 30, "expected populated MCP catalogue");
  assert.equal(new Set(names).size, names.length, "duplicate MCP tool names");
  assert.ok(names.every(name => /^ccp_(?!v\d+_)[a-z][a-z0-9_]*$/.test(name)), "versioned tool name in catalogue");
  assert.equal(legacyToolPattern.test(currentToolNames), false, "legacy name in MCP tool catalogue/dispatch");
});

test("no source or test fixtures invoke retired MCP names", () => {
  const stale = [];
  for (const dir of ["app","lib","components","scripts","e2e"]) {
    for (const file of files(join(root, dir))) {
      const path = relative(root, file).replaceAll("\\", "/");
      if (path === "scripts/mcp-unversioned-tool-names.test.mjs") continue;
      let content = readFileSync(file, "utf8");
      // The one negative E2E probe proves an old name is rejected with NOT_FOUND.
      if (path === "e2e/agent-mcp.spec.ts") content = content.replaceAll("ccp_v1_attendance_record", "");
      if (legacyToolPattern.test(content)) stale.push(path);
    }
  }
  assert.deepEqual(stale, [], "retired MCP tool references found");
});
