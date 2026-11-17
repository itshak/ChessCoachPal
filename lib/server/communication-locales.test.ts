import {describe,it,expect} from "vitest";
import {communicationCopy,familyCommunicationLocale} from "@/lib/server/communication-locales";
import {invoiceFormatPeriod,invoiceVisualRuns} from "@/lib/server/invoice-pdf";

describe("recipient communication language",()=>{
  it("defaults to English when a family has no explicit preference, not the teacher UI locale",()=>{
    expect(familyCommunicationLocale({preferred_locale:null})).toBe("en");
    expect(familyCommunicationLocale({preferred_locale:""})).toBe("en");
    expect(familyCommunicationLocale({preferred_locale:"es"})).toBe("en");
    expect(familyCommunicationLocale({preferred_locale:"he"})).toBe("he");
    expect(familyCommunicationLocale({preferred_locale:"ru"})).toBe("ru");
  });
  it("keeps dates, amounts, portal notices and event templates locale specific",()=>{
    expect(communicationCopy.he.invoice.heading).toBe("חשבונית");
    expect(communicationCopy.ru.invoice.heading).toBe("Счёт");
    expect(communicationCopy.en.invoice.heading).toBe("Invoice");
    expect(communicationCopy.he.event.introInvite("אליפות")).toContain("אליפות");
    expect(communicationCopy.ru.event.introReminder("Турнир")).toContain("Турнир");
    expect(invoiceFormatPeriod("2026-11-01","2026-11-30","en")).toContain("Nov");
    expect(invoiceFormatPeriod("2026-11-01","2026-11-30","ru")).toContain("нояб");
  });
  it("keeps Hebrew, Cyrillic and Latin in their correct relative on-page visual order",()=>{
    expect(invoiceVisualRuns("שיעור chess Иван — lesson","en"))
      .toEqual(["שיעור"," chess Иван — lesson"]);
    expect(invoiceVisualRuns("שיעור chess Иван — lesson","ru"))
      .toEqual(["שיעור"," chess Иван — lesson"]);
    expect(invoiceVisualRuns("שיעור chess Иван — lesson","he"))
      .toEqual(["chess Иван — lesson ","שיעור"]);
    expect(invoiceVisualRuns("שלום мир — pay at office","en"))
      .toEqual(["שלום"," мир — pay at office"]);
  });
});
