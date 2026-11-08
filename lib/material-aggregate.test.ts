import {describe,it,expect} from "vitest";
import {summarizeMaterialClaims,type MaterialSummaryRow} from "./material-aggregate";

const claim=(id:string,studentId:string,sessionId:string|null,
  stage:"assigned"|"taught"|"completed"="taught"):MaterialSummaryRow=>({
    id,studentId,sessionId,stage,resourceId:"book-1",label:"Endgame study",
  });
describe("whole-history material evidence aggregation",()=>{
  it("does not multiply one group session/material by its two students",()=>{
    const result=summarizeMaterialClaims([claim("1","s1","lesson-1"),claim("2","s2","lesson-1")]);
    expect(result.evidenceClaims).toBe(2);
    expect(result.stages.taught).toBe(2);
    expect(result.uniqueSessionMaterialStageCount).toBe(1);
    expect(result.sessionCount).toBe(1);
    expect(result.studentCount).toBe(2);
    expect(result.resources[0].studentCount).toBe(2);
  });
  it("preserves distinct assigned/taught/completed stages without inferring mastery",()=>{
    const result=summarizeMaterialClaims([claim("1","s1",null,"assigned"),
      claim("2","s1",null,"taught"),claim("3","s1",null,"taught")]);
    expect(result.stages).toEqual({assigned:1,taught:2,completed:0});
    expect(result.uniqueStudentMaterialStageCount).toBe(2);
    expect(result.uniqueSessionMaterialStageCount).toBe(0);
  });
  it("returns an empty, safe summary",()=>{
    expect(summarizeMaterialClaims([])).toMatchObject({evidenceClaims:0,resources:[],
      studentCount:0,stages:{assigned:0,taught:0,completed:0}});
  });
});
