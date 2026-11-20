import {describe,expect,it} from "vitest";
import {portalSharedNoteVisible} from "./portal-scope-service";

describe("portal shared-note audience (frozen original roster)",()=>{
  const student="00000000-0000-4000-8000-000000000001";
  const classmate="00000000-0000-4000-8000-000000000002";

  it("allows only the targeted learner in a group, never the classmate",()=>{
    expect(portalSharedNoteVisible(student,student,8)).toBe(true);
    expect(portalSharedNoteVisible(classmate,student,8)).toBe(false);
    expect(portalSharedNoteVisible(null,student,8)).toBe(false);
  });

  it("allows explicitly approved general notes for a one-to-one session",()=>{
    expect(portalSharedNoteVisible(null,student,1)).toBe(true);
  });

  it("fails closed on missing/invalid original roster attribution",()=>{
    expect(portalSharedNoteVisible(null,student,0)).toBe(false);
    expect(portalSharedNoteVisible(student,student,0)).toBe(false);
  });
});
