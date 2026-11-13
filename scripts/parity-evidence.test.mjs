import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCheckedParityRow, validateUniqueCheckedParityReferences } from "./parity-evidence.mjs";

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

test("each checked requirement needs distinct named executable evidence", () => {
  const other = "| - [x] | Another behavior | e2e/parity.spec.ts#PARITY-student-update |";
  assert.deepEqual(validateUniqueCheckedParityReferences([row, other]), []);
  assert.match(validateUniqueCheckedParityReferences([row, row])[0], /reuses evidence/);
  assert.deepEqual(validateUniqueCheckedParityReferences([row, row.replace("[x]", "[ ]")]), []);
});

test("accepts real bound delegated OAuth/MCP tool calls but rejects unbound tool() mocks",()=>{
 const source=[
  'test("PARITY:PARITY-student-archive secure",async({page,request})=>{',
  'const tool=await delegatedTool(page,request);',
  'const result=await tool("ccp_v1_students_archive_preview",{studentId:"id"});',
  'const web=await page.request.get("/api/students/id");',
  'expect(result).toEqual(await web.json());',
  '});',
 ].join("\n");
 assert.deepEqual(check(source),[]);
 assert.match(check(source.replace("const tool=await delegatedTool(page,request);",
  "const tool=async()=>({data:null});"))[0],/MCP invocation/);
 assert.match(check(source.replace('tool("ccp_v1_students_archive_preview"',
  'tool("fake_tool"'))[0],/MCP invocation/);
});
