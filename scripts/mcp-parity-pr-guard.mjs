#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inventory = JSON.parse(readFileSync(join(root, "scripts/mcp-website-parity.json"), "utf8"));

export function parityChangeViolations(paths, registry = inventory) {
  const changed = new Set(paths);
  const teacherApi = new Set(registry.apiRoutes.filter(r => r.kind === "teacher").map(r => r.path));
  const teacherSurfaces = paths.filter(p =>
    teacherApi.has(p) ||
    (p.startsWith("app/(teacher)/") && p.endsWith("/page.tsx")) ||
    (p.startsWith("components/teacher/") && p.endsWith(".tsx"))
  );
  if (teacherSurfaces.length === 0) return [];
  const issues = [];
  if (!changed.has("scripts/mcp-website-parity.json"))
    issues.push("No reviewed same-PR teacher parity registry delta");
  if (!changed.has("lib/server/agent-tools.ts"))
    issues.push("No same-PR MCP tool catalogue/adapter delta");
  if (!paths.some(p => p.startsWith("e2e/") && p.endsWith(".spec.ts")))
    issues.push("No same-PR authenticated browser/MCP E2E delta");
  return issues;
}

function run() {
  const base = process.env.PARITY_BASE_SHA, head = process.env.PARITY_HEAD_SHA;
  if (!base || !head) {
    console.log("PR parity change guard skipped outside pull request (normal source audit still runs).");
    return;
  }
  const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRT",
    base + "..." + head], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const errors = parityChangeViolations(changed);
  for (const error of errors) console.error("MCP PARITY PR ERROR: " + error);
  if (errors.length) process.exitCode = 1;
  else console.log("PR parity change guard passed for " + changed.length + " changed paths.");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) run();
