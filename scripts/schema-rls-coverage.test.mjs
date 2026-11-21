import { test } from "node:test";
import { deepStrictEqual, match, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalPublicTableRlsErrors } from "./schema-rls-coverage.mjs";

const create = (name) => `CREATE TABLE public.${name} (id uuid PRIMARY KEY);`;
const enable = (name) => `ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`;
const disable = (name) => `ALTER TABLE public.${name} DISABLE ROW LEVEL SECURITY;`;

test("all current canonical public tables explicitly enable RLS", () => {
  const sql = readFileSync(new URL(
    "../supabase/migrations/20261107000000_chesscoachpal_baseline.sql", import.meta.url,
  ), "utf8");
  deepStrictEqual(canonicalPublicTableRlsErrors(sql), []);
});

test("fails closed on an unprotected new public table", () => {
  const errors = canonicalPublicTableRlsErrors(create("students"));
  ok(errors.some((error) => error.includes("Missing explicit RLS ENABLE for public.students")));
});

test("rejects an explicit RLS DISABLE even if followed by ENABLE", () => {
  const errors = canonicalPublicTableRlsErrors([
    create("students"), enable("students"), disable("students"), enable("students"),
  ].join("\n"));
  ok(errors.some((error) => error.includes("RLS DISABLE is prohibited")));
});

test("comments cannot supply missing coverage", () => {
  const errors = canonicalPublicTableRlsErrors([
    create("students"),
    "-- " + enable("students"),
    "/*\n" + enable("students") + "\n*/",
  ].join("\n"));
  ok(errors.some((error) => error.includes("Missing explicit RLS ENABLE")));
});

test("does not count duplicate declarations or unrelated RLS references", () => {
  const errors = canonicalPublicTableRlsErrors([
    create("students"), create("students"), enable("students"), enable("ghost"),
  ].join("\n"));
  ok(errors.some((error) => error.includes("Duplicate public table declaration")));
  ok(errors.some((error) => error.includes("not declared in baseline: ghost")));
});

test("parses mixed-case, quoted public identifiers and multiline SQL", () => {
  const sql = [
    'CREATE TABLE "public"."Students" (id uuid);',
    'ALTER TABLE "public"."Students"\n ENABLE ROW LEVEL SECURITY;',
  ].join("\n");
  deepStrictEqual(canonicalPublicTableRlsErrors(sql), []);
});
