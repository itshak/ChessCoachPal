import { describe, expect, it } from "vitest";
import { normalizeLearningLink,materialLinkListInput,materialLinkCreateInput,
 materialLinkUpdateInput,materialLinkUnlinkInput } from "./chess-learning";

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
  it("requires canonical material identity, scope, request receipts and confirmation",()=>{
    const uuid="00000000-0000-4000-8000-000000000001";
    const data={materialId:uuid,studentId:uuid,requestId:uuid,confirmed:true};
    expect(materialLinkCreateInput.safeParse(data).success).toBe(true);
    expect(materialLinkCreateInput.safeParse({...data,studentId:undefined}).success).toBe(false);
    expect(materialLinkCreateInput.safeParse({...data,confirmed:false}).success).toBe(false);
    expect(materialLinkCreateInput.safeParse({...data,url:"https://example.com"}).success).toBe(false);
    expect(materialLinkListInput.safeParse({studentId:uuid}).success).toBe(true);
    expect(materialLinkListInput.safeParse({}).success).toBe(false);
    expect(materialLinkUpdateInput.safeParse({linkId:uuid,materialId:uuid,expectedRevision:1,confirmed:true}).success).toBe(true);
    expect(materialLinkUpdateInput.safeParse({linkId:uuid,materialId:uuid,expectedRevision:0,confirmed:true}).success).toBe(false);
    expect(materialLinkUnlinkInput.safeParse({linkId:uuid,expectedRevision:1,confirmed:true}).success).toBe(true);
  });
});
