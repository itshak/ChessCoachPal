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
    expect(english("ratingHistory.games",{count:1})).toBe("1 game");
    expect(english("ratingHistory.games",{count:3})).toBe("3 games");
    expect(hebrew("ratingHistory.games",{count:1})).toBe("משחק אחד");
    expect(hebrew("ratingHistory.games",{count:4})).toBe("4 משחקים");
    expect(russian("ratingHistory.games",{count:1})).toBe("1 игра");
    expect(russian("ratingHistory.games",{count:2})).toBe("2 игры");
    expect(russian("ratingHistory.games",{count:5})).toBe("5 игр");
    expect(russian("studentInfo.practiceApproxYears",{count:1})).toContain("1 года");
    expect(russian("studentInfo.practiceApproxYears",{count:5})).toContain("5 лет");
    expect(hebrew("studentInfo.practiceSinceDate",{date:"2021"})).toContain("2021");
    expect(hebrew("lessonCapture.approveAtomic")).toContain("אטומית");
    expect(russian("lessonCapture.approveAtomic")).toContain("ОДНОЙ");
    expect(hebrew("materialCatalog.archiveImpact",{assignments:2,relations:3})).toContain("3");
    expect(russian("materialHistory.aggregateHeadline",{count:7})).toContain("7");
    expect(hebrew("materialHistory.recordConfirm",{stage:"נלמד"})).toContain("נלמד");
    expect(hebrew("homework.attemptSaved")).toContain("אין בכך");
    expect(russian("homework.reviewSaved")).toContain("тренера");
    expect(hebrew("trainingPlans.goalCount",{count:2})).toContain("2 יעדים");
    expect(russian("trainingPlans.goalCount",{count:1})).toBe("1 цель");
    expect(russian("trainingPlans.goalCount",{count:5})).toBe("5 целей");

  });
  it("preserves multilingual user-provided names in interpolated translations",()=>{
    const hebrew=createTranslator({locale:"he",messages:he});
    const russian=createTranslator({locale:"ru",messages:ru});
    expect(hebrew("dashboard.welcome",{name:"Ребекка כהן"})).toContain("Ребекка כהן");
    expect(russian("dashboard.welcome",{name:"רבקה כהן"})).toContain("רבקה כהן");
    expect(hebrew("ratingHistory.review",{username:"Шахматы כהן",provider:"Lichess"})).toContain("Шахматы כהן");
    expect(russian("ratingHistory.review",{username:"משה шахмат",provider:"Chess.com"})).toContain("משה шахмат");
  });
});
