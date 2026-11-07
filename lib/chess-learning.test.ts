import { describe, expect, it } from "vitest";
import { normalizeLearningLink, resourceInput } from "./chess-learning";

describe("chess resource references", () => {
  it("retains stable Lichess study/chapter IDs without fetching", () => {
    expect(normalizeLearningLink("https://lichess.org/study/Ab12Cd34/Ef56Gh78", "lichess_study"))
      .toMatchObject({ providerStudyId: "Ab12Cd34", providerChapterId: "Ef56Gh78" });
    expect(normalizeLearningLink("https://lichess.org/study/Ab12Cd34", "lichess_study")
      .providerChapterId).toBeNull();
  });
  it.each([
    "http://lichess.org/study/Ab12Cd34",
    "https://lichess.org.evil.example/study/Ab12Cd34",
    "https://username:pass@lichess.org/study/Ab12Cd34",
    "https://lichess.org/study/no",
    "https://lichess.org/study/Ab12Cd34?user=private",
    "https://127.0.0.1/secret",
    "https://localhost/secret",
  ])("rejects unsafe or malformed Lichess reference: %s", url => {
    expect(() => normalizeLearningLink(url, "lichess_study")).toThrow();
  });
  it("permits ordinary public HTTPS links but no private/internal links", () => {
    expect(normalizeLearningLink("https://example.org/chess/endgames#chapter", "external")
      .url).toBe("https://example.org/chess/endgames#chapter");
    for (const url of ["http://example.org", "https://[::1]/", "https://127.0.0.1/", "https://intranet.local/", "https://example.org:8443/"]) {
      expect(() => normalizeLearningLink(url, "external")).toThrow();
    }
  });
  it("requires a student or session and rejects unknown fields", () => {
    const basics = { label:"King opposition", url:"https://example.org/study", resourceType:"external" };
    expect(resourceInput.safeParse(basics).success).toBe(false);
    expect(resourceInput.safeParse({ ...basics, studentId:"00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(resourceInput.safeParse({ ...basics, studentId:"00000000-0000-4000-8000-000000000001", verified:true }).success).toBe(false);
  });
});
