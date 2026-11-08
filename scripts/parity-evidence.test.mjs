import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCheckedParityRow } from "./parity-evidence.mjs";

const path = "e2e/parity.spec.ts";
const row = "| - [x] | Archive student | " + path + "#PARITY-student-archive |";
const valid = [
  'test("PARITY:PARITY-student-archive compares clients", async ({page}) => {',
  '  const result = await call("ccp_v1_students_archive_preview", {studentId:"id"});',
  '  const response = await page.request.get("/api/students/id?archivePreview=true");',
  '  expect(result).toEqual(await response.json());',
  '});'
].join("\n");
const check = (source, candidate=row) =>
  validateCheckedParityRow(candidate, 3, file => file === path, () => source);

test("rejects checked rows lacking distinct named test evidence", () => {
  assert.match(check(valid, "| - [x] | Archive | e2e/parity.spec.ts |")[0], /needs/);
  assert.match(check(valid.replace("PARITY:PARITY-student-archive","Irrelevant"))[0], /no test/);
});
test("validates transport and assertions within the named test", () => {
  assert.deepEqual(check(valid), []);
  assert.match(check(valid.replace('await call("ccp_v1_students_archive_preview", {studentId:"id"})','42'))[0], /MCP/);
  assert.match(check(valid.replace('page.request.get("/api/students/id?archivePreview=true")','page.goto("/students")'))[0], /website/);
  assert.match(check(valid.replace("expect(result).toEqual","console.log"))[0], /assertion/);
});
test("rejects unsafe references", () => {
  assert.match(check(valid, "| - [x] | Archive | e2e/../private.spec.ts#PARITY-student-archive |")[0], /unsafe/);
});
