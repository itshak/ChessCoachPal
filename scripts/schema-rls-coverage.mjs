#!/usr/bin/env node
/**
 * P0 unified-schema freeze: every public application table created in the
 * canonical fresh-install baseline must explicitly enable PostgreSQL RLS.
 * Static source coverage only: policy correctness, tenant isolation and
 * effective grants still require SQL-backed negative A/B tests.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const baseline = join(here, "../supabase/migrations/20261107000000_chesscoachpal_baseline.sql");

export function canonicalPublicTableRlsErrors(sql) {
  // Remove non-executable SQL comments so a commented-out ENABLE cannot
  // masquerade as security enforcement. No SQL is executed by this checker.
  const source = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*--[^\r\n]*$/gm, "");
  const declarations = [...source.matchAll(
    /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)"?([a-z_][a-z_0-9$]*)"?\s*\(/gim,
  )].map((match) => match[1].toLowerCase());
  const toggles = [...source.matchAll(
    /^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?public"?\.)"?([a-z_][a-z_0-9$]*)"?\s+(ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY\s*;/gim,
  )].map((match) => ({
    table: match[1].toLowerCase(),
    action: match[2].toUpperCase(),
  }));
  const errors = [];
  const names = new Set(declarations);
  if (names.size === 0) errors.push("No canonical public CREATE TABLE declarations found");
  for (const name of names) {
    if (declarations.filter((value) => value === name).length !== 1)
      errors.push("Duplicate public table declaration: " + name);
    const events = toggles.filter((item) => item.table === name);
    if (!events.some((item) => item.action === "ENABLE"))
      errors.push("Missing explicit RLS ENABLE for public." + name);
    if (events.some((item) => item.action === "DISABLE"))
      errors.push("RLS DISABLE is prohibited for public." + name);
  }
  for (const { table } of toggles) {
    if (!names.has(table))
      errors.push("RLS references public table not declared in baseline: " + table);
  }
  return [...new Set(errors)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = canonicalPublicTableRlsErrors(readFileSync(baseline, "utf8"));
  if (errors.length > 0) {
    for (const error of errors) console.error("Canonical RLS coverage: " + error);
    process.exitCode = 1;
  } else {
    console.log("Canonical public-table RLS coverage verified.");
  }
}
