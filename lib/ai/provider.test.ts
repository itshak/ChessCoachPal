import { describe, expect, it } from "vitest";
import { ensureProgressNoteTitle,progressNoteDate } from "@/lib/ai/provider";

describe("ensureProgressNoteTitle", () => {
  it("prepends a dated title when missing", () => {
    expect(ensureProgressNoteTitle("Emma is doing well.", "July 13, 2026")).toBe(
      "# Progress Note — July 13, 2026\n\nEmma is doing well."
    );
  });

  it("rewrites an existing Progress Note heading to the dated form", () => {
    const md = "# Progress Note: Emma\n\n### Overview\n\nHello";
    expect(ensureProgressNoteTitle(md, "July 13, 2026")).toBe(
      "# Progress Note — July 13, 2026\n\n### Overview\n\nHello"
    );
  });
});


describe("review-only multilingual AI progress note headings",()=>{
  it("keeps exact source content and chess notation under localized Hebrew/Russian headings",()=>{
    const source="### Observations\n\nPuzzle UCI e2e4; Шахматный урок; הערה מקורית.";
    expect(ensureProgressNoteTitle(source,"17 בנובמבר 2026","he"))
      .toBe(`# סיכום התקדמות — 17 בנובמבר 2026\n\n${source}`);
    expect(ensureProgressNoteTitle(source,"17 ноября 2026 г.","ru"))
      .toBe(`# Заметка о прогрессе — 17 ноября 2026 г.\n\n${source}`);
  });
  it("replaces model-generated English heading with desired language without duplicating body",()=>{
    const md="# Progress Note: Some pupil\n\n### Facts\n\nNf3, Иван, גדעון";
    expect(ensureProgressNoteTitle(md,"17 ноября 2026 г.","ru"))
      .toBe("# Заметка о прогрессе — 17 ноября 2026 г.\n\n### Facts\n\nNf3, Иван, גדעון");
    const Hebrew="# סיכום התקדמות — היום\n\n### ממצאים\n\nNa5";
    expect(ensureProgressNoteTitle(Hebrew,"17 בנובמבר 2026","he"))
      .toBe("# סיכום התקדמות — 17 בנובמבר 2026\n\n### ממצאים\n\nNa5");
  });
  it("formats validated ISO date explicitly, never guesses ambiguous local labels",()=>{
    const context={noteDateLabel:"11/12/2026",noteDateISO:"2026-11-17"} as import("@/lib/ai/provider").StudentSummaryContext;
    expect(progressNoteDate(context,"ru")).toContain("ноября");
    expect(progressNoteDate(context,"he")).toContain("נובמבר");
    const missing={...context,noteDateISO:"2026-02-31"};
    expect(progressNoteDate(missing,"ru")).toBe("11/12/2026");
  });
});
