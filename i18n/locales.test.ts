import {describe,expect,it} from "vitest";
import {defaultLocale,isAppLocale,languageDirection,negotiateLocale,supportedLocale} from "./locales";

describe("locale registry and safe preference negotiation",()=>{
  it("supports English, Hebrew RTL and Russian LTR",()=>{
    expect(defaultLocale).toBe("en");
    expect(languageDirection("he")).toBe("rtl");
    expect(languageDirection("ru")).toBe("ltr");
    expect(languageDirection("en")).toBe("ltr");
  });
  it("rejects unsupported UI language values and safely reduces regional tags",()=>{
    expect(isAppLocale("he")).toBe(true);
    expect(isAppLocale("he-IL")).toBe(false);
    expect(isAppLocale("fr")).toBe(false);
    expect(isAppLocale(undefined)).toBe(false);
    expect(supportedLocale("he-IL")).toBe("he");
    expect(supportedLocale("ru-RU")).toBe("ru");
    expect(supportedLocale("../en")).toBe(null);
    expect(supportedLocale("ar")).toBe(null);
  });
  it("honors weighted browser headers without overriding teacher preference",()=>{
    expect(negotiateLocale("fr,ru;q=0.8,he;q=0.9,en;q=0.7")).toBe("he");
    expect(negotiateLocale("fr,de;q=0.7")).toBe("en");
    expect(negotiateLocale("ru-RU,ru;q=0.9,en;q=0.1")).toBe("ru");
    expect(negotiateLocale("ru;q=0,he;q=0.6")).toBe("he");
    expect(negotiateLocale(null)).toBe("en");
  });
});
