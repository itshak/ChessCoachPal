import {describe,it,expect} from "vitest";
import {materialCoverageSummary,type MaterialEvidenceRow} from "./material-coverage-report";
const evidence=(id:string,student_id:string,stage:MaterialEvidenceRow["stage"],
 session_id:string|null="s1",resource_id="r1"):MaterialEvidenceRow=>({
 id,student_id,stage,session_id,resource_id,occurred_on:"2027-04-12",
 chess_learning_resources:{label:"Opposition",url:"https://lichess.org/study/Ab12Cd34",
 resource_type:"lichess_study",provider_study_id:"Ab12Cd34",provider_chapter_id:null},
});
describe("teacher-attested material coverage",()=>{
 it("counts a group session once but three pupils separately",()=>{
  const r=materialCoverageSummary([
   evidence("a","alice","taught"),evidence("b","bob","taught"),evidence("c","carol","taught"),
  ]);
  expect(r.totals.distinctTeachingEvents).toBe(1);
  expect(r.totals.teachingEvidenceCount).toBe(3);
  expect(r.materials[0].taughtStudentCount).toBe(3);
  expect(r.materials[0].distinctTeachingEvents).toBe(1);
 });
 it("keeps assigned, taught and completed independent",()=>{
  const r=materialCoverageSummary([
   evidence("a","alice","assigned"),evidence("b","alice","taught"),
   evidence("c","bob","completed"),
  ]);
  expect(r.totals.assignmentEvidenceCount).toBe(1);
  expect(r.totals.teachingEvidenceCount).toBe(1);
  expect(r.totals.completionEvidenceCount).toBe(1);
  expect(r.materials[0].completedStudentCount).toBe(1);
 });
 it("tracks separate off-session teacher attestations without faking classroom time",()=>{
  const r=materialCoverageSummary([
   evidence("a","alice","taught",null),evidence("b","alice","taught",null),
  ]);
  expect(r.totals.distinctTeachingEvents).toBe(2);
  expect(r.teachingTimeExcluded).toBe(true);
 });
 it("is deterministic for empty records",()=>{
  const r=materialCoverageSummary([]);
  expect(r.totals).toEqual({resourceCount:0,studentCount:0,
   assignmentEvidenceCount:0,teachingEvidenceCount:0,
   completionEvidenceCount:0,distinctTeachingEvents:0});
  expect(r.materials).toEqual([]);
 });
});
