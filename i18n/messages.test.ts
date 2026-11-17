import {describe,it,expect} from "vitest";
import {createTranslator} from "next-intl";
import en from "./messages/en.json";
import he from "./messages/he.json";
import ru from "./messages/ru.json";

describe("reviewed locale ICU messages",()=>{
  it("renders count-sensitive English, Hebrew and Russian forms",()=>{
    const english=createTranslator({locale:"en",messages:en});
    const hebrew=createTranslator({locale:"he",messages:he});
    const russian=createTranslator({locale:"ru",messages:ru});
    expect(english("events.participants",{count:1})).toBe("1 participant");
    expect(english("events.participants",{count:3})).toBe("3 participants");
    expect(hebrew("events.participants",{count:1})).toContain("משתתף אחד");
    expect(hebrew("events.participants",{count:3})).toContain("3 משתתפים");
    expect(russian("events.participants",{count:1})).toBe("1 участник");
    expect(russian("events.participants",{count:2})).toBe("2 участника");
    expect(russian("events.participants",{count:5})).toBe("5 участников");
    expect(english("portal.creditPackage",{count:1,minutes:45})).toBe("1 × 45-min lesson");
    expect(hebrew("portal.creditPackage",{count:2,minutes:60})).toContain("2 שיעורים");
    expect(russian("portal.creditPackage",{count:1,minutes:60})).toContain("1 урок");
    expect(russian("portal.creditPackage",{count:3,minutes:60})).toContain("3 урока");
    expect(russian("portal.creditPackage",{count:5,minutes:60})).toContain("5 уроков");
    expect(hebrew("portal.cancelWarning",{hours:1})).toContain("שעה אחת");

  });
  it("preserves multilingual user-provided names in interpolated translations",()=>{
    const hebrew=createTranslator({locale:"he",messages:he});
    const russian=createTranslator({locale:"ru",messages:ru});
    expect(hebrew("dashboard.welcome",{name:"Ребекка כהן"})).toContain("Ребекка כהן");
    expect(russian("dashboard.welcome",{name:"רבקה כהן"})).toContain("רבקה כהן");
  });
});
