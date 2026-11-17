import {describe,it,expect} from "vitest";
import {localizedNotificationText} from "@/lib/server/notification-copy";

describe("system notification localization",()=>{
  it("uses Hebrew/Russian in payment summaries while preserving monetary value and family names",()=>{
    const invoice={kind:"invoice_paid" as const,family:"יוסף Петров",
      amount:"₪123.45",periodStart:"2026-11-01",periodEnd:"2026-11-30"};
    for(const locale of ["en","he","ru"] as const){
      const msg=localizedNotificationText(invoice,locale);
      expect(msg.body).toContain(invoice.family);
      expect(msg.title).toContain(invoice.amount);
      expect(msg.body).toContain(invoice.amount);
    }
    expect(localizedNotificationText(invoice,"he").title).toContain("התקבל תשלום");
    expect(localizedNotificationText(invoice,"ru").title).toContain("Получен платёж");
  });
  it("translates RSVP status/field names without altering a guardian's note",()=>{
    const input={kind:"event_rsvp" as const,family:"Cohen כהן",eventTitle:"Мастер-класс",
      status:"maybe" as const,partySize:3,note:"Пожалуйста, позвоните לי"};
    const h=localizedNotificationText(input,"he");
    const r=localizedNotificationText(input,"ru");
    expect(h.title).toContain("אולי");
    expect(r.title).toContain("Возможно");
    expect(h.body).toContain("מספר משתתפים: 3");
    expect(r.body).toContain("Количество участников: 3");
    expect(h.body).toContain(input.note);
    expect(r.body).toContain(input.note);
  });
});
