import { describe, expect, it } from "vitest";
import { contrast, findStudents, palettes, sessions, students } from "./fixtures";
describe("design lab synthetic fixtures",()=>{
  it("has six distinct candidates plus the existing baseline",()=>{
    expect(palettes).toHaveLength(7);
    expect(new Set(palettes.map(p=>p.dark.bg)).size).toBe(7);
  });
  it("candidate text and accent colors meet 4.5:1 on both surfaces",()=>{
    for(const palette of palettes.slice(0,6)) for(const tone of [palette.dark,palette.light]) for(const bg of [tone.bg,tone.surface]) for(const fg of [tone.fg,tone.muted,tone.accent]) expect(contrast(fg,bg),palette.name+" "+fg+" on "+bg).toBeGreaterThanOrEqual(4.5);
  });
  it("finds bilingual aliases and keeps archived students out by default",()=>{
    expect(findStudents("דני",false).map(s=>s.id)).toEqual(["s1"]);
    expect(findStudents("саша",false).map(s=>s.id)).toEqual(["s3"]);
    expect(findStudents("נועה",false)).toEqual([]);
    expect(findStudents("נועה",true).map(s=>s.id)).toEqual(["s4"]);
  });
  it("keeps unique group participants and a single group session",()=>{
    expect(sessions).toHaveLength(3);
    expect(sessions[0].participants).toHaveLength(2);
    for(const session of sessions){
      expect(new Set(session.participants).size).toBe(session.participants.length);
      expect(session.participants.every(id=>students.some(s=>s.id===id&&!s.archived))).toBe(true);
    }
  });
});
