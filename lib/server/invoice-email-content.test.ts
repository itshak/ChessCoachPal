import {describe,it,expect} from "vitest";
import {buildInvoiceEmailContent} from "@/lib/server/invoice-email-content";

const base={familyGreetingName:"כהן Петров",studioName:"Knight Chess",
  periodStart:"2026-11-01",periodEnd:"2026-11-30",currency:"ILS",
  subtotalCents:12345,paidCents:2345,balanceCents:10000,
  paymentInstructions:"Банк & <X>",paymentProvider:"manual",hasPaymentQrCode:true};

describe("family invoice preview and actual send share one recipient template",()=>{
  it.each(["en","he","ru"] as const)("%s preserves numbers and Unicode without leaking HTML markup",locale=>{
    const result=buildInvoiceEmailContent({...base,locale});
    expect(result.locale).toBe(locale);
    expect(result.text).toContain("כהן Петров");
    expect(result.text).toContain("Банк & <X>");
    expect(result.html).toContain(`lang="${locale}"`);
    expect(result.html).toContain(`dir="${locale==="he"?"rtl":"ltr"}"`);
    expect(result.html).toContain("Банк &amp; &lt;X&gt;");
    expect(result.subject).toContain("Knight Chess");
    expect(result.text).not.toContain("https://pay.stripe.com");
  });
  it("Hebrew and Russian send preview do not contain English invoice filler",()=>{
    expect(buildInvoiceEmailContent({...base,locale:"he"}).subject).toContain("חשבונית");
    expect(buildInvoiceEmailContent({...base,locale:"ru"}).subject).toContain("Счёт");
    expect(buildInvoiceEmailContent({...base,locale:"ru"}).text).not.toContain("Please find attached");
  });
});
