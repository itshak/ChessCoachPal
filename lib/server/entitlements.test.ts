import {describe,expect,it} from "vitest";
import {reachedStudentCapacity,type SqlCapability} from "./entitlements";

const capability = (limit:number|null, unlimited=false):SqlCapability=>({
  capabilityKey:"students.active",kind:"integer_limit",planCode:"free",
  planVersionId:"synthetic",enabled:true,unlimited,limit,
  evaluatedAt:"2026-11-22T00:00:00.000Z",
});

describe("reachedStudentCapacity",()=>{
  it("shows an explicitly configured zero cap even when the roster is empty",()=>{
    expect(reachedStudentCapacity({activeStudentCount:0,studentCapacity:capability(0)})).toBe(0);
  });
  it("uses the effective SQL limit instead of legacy plan thresholds",()=>{
    const studentCapacity=capability(7);
    expect(reachedStudentCapacity({activeStudentCount:6,studentCapacity})).toBeNull();
    expect(reachedStudentCapacity({activeStudentCount:7,studentCapacity})).toBe(7);
    expect(reachedStudentCapacity({activeStudentCount:9,studentCapacity})).toBe(7);
  });
  it("does not show a cap for the unlimited fresh-install Free plan",()=>{
    expect(reachedStudentCapacity({activeStudentCount:500,studentCapacity:capability(null,true)})).toBeNull();
  });
});
