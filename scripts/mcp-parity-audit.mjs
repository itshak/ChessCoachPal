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
      const path = join(absolute¶»§q«^