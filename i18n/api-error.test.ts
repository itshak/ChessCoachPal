import {describe,it,expect} from "vitest";
import {localizedApiError,LocalizedUiError} from "./api-error";

describe("human-facing API error translation",()=>{
  it("preserves English technical diagnostics as an existing-client fallback",()=>{
    expect(localizedApiError({code:"VALIDATION_ERROR",error:"Choose a date"},"Try again","en"))
      .toBe("Choose a date");
  });
  it("uses stable public error codes in Hebrew and Russian, not raw English backend text",()=>{
    const payload={code:"VALIDATION_ERROR",error:"Choose a date"};
    expect(localizedApiError(payload,"נסו שוב","he")).toBe("בדקו את הערכים שהוזנו");
    expect(localizedApiError(payload,"Повторите попытку","ru")).toBe("Проверьте введённые данные");
  });
  it("uses localized per-form fallback and stable code when a code lacks a translation",()=>{
    expect(localizedApiError({code:"STUDIO_TEMP_UNAVAILABLE",error:"Backend exploded"},
      "שמירת ההגדרות נכשלה","he")).toBe("שמירת ההגדרות נכשלה (STUDIO_TEMP_UNAVAILABLE)");
    expect(localizedApiError({error:"Backend exploded"},"Ошибка сохранения","ru"))
      .toBe("Ошибка сохранения");
  });
  it("preserves only explicitly trusted localized UI errors across component callbacks",()=>{
    const trusted=new LocalizedUiError("יש לבחור תלמיד");
    expect(localizedApiError(trusted,"פעולה נכשלה","he")).toBe("יש לבחור תלמיד");
    expect(localizedApiError({error:trusted.message},"פעולה נכשלה","he"))
      .toBe("פעולה נכשלה");
  });
  it("handles native provider Errors without echoing English into Hebrew",()=>{
    expect(localizedApiError(new Error("Provider refused the request"),"הפעולה נכשלה","he"))
      .toBe("הפעולה נכשלה");
    expect(localizedApiError(new Error("Provider refused the request"),"Try again","en"))
      .toBe("Provider refused the request");
  });
  it("does not echo arbitrary invalid codes or secret-shaped messages into Hebrew",()=>{
    expect(localizedApiError({code:"secret://abc",error:"sk_live_PRIVATE"},"פעולה נכשלה","he"))
      .toBe("פעולה נכשלה");
    expect(localizedApiError(null,"פעולה נכשלה","he")).toBe("פעולה נכשלה");
  });
});
