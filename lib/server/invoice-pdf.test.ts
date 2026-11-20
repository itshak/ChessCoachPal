import { describe, it, expect } from "vitest";
import { buildInvoicePdf } from "@/lib/server/invoice-pdf";

describe("buildInvoicePdf", () => {
  it("builds a PDF when a line item includes emoji in the student name", async () => {
    const bytes = await buildInvoicePdf({
      businessName: "Chess Teacher Example",
      familyName: "Morales family",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-10",
      currency: "USD",
      items: [
        {
          description: "Lesson — Andrés❤️, Aug 10, 2026 (5 min @ $60.00/hr)",
          quantity: 1,
          unitCents: 500,
          amountCents: 500,
        },
      ],
      subtotalCents: 500,
      paymentInstructions: "",
      notes: "",
    });
    expect(bytes.byteLength).toBeGreaterThan(500);
    // PDF magic
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });

  it("embeds a payment QR code, moving it to a new page when space runs out", async () => {
    const qr =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const { PDFDocument } = await import("pdf-lib");
    const build = (itemCount: number) =>
      buildInvoicePdf({
        businessName: "Studio",
        familyName: "Lim family",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        currency: "SGD",
        items: Array.from({ length: itemCount }, (_, i) => ({
          description: `Lesson ${i + 1}`,
          quantity: 1,
          unitCents: 5000,
          amountCents: 5000,
        })),
        subtotalCents: 5000 * itemCount,
        paymentInstructions: "PayNow to UEN 12345678A",
        paymentQrCode: qr,
      });

    const short = await PDFDocument.load(await build(2));
    expect(short.getPageCount()).toBe(1);
    const long = await PDFDocument.load(await build(40));
    expect(long.getPageCount()).toBe(2);
  });

  it("paginates all long invoice line items and notes rather than clipping",async()=>{
    const {PDFDocument}=await import("pdf-lib");
    const render=(count:number)=>buildInvoicePdf({
      businessName:"Synthetic chess studio",
      familyName:"Knight family",
      periodStart:"2047-01-01",periodEnd:"2047-01-31",
      currency:"USD",items:Array.from({length:count},(_,i)=>({
        description:"Unique lesson index "+String(i+1).padStart(4,"0"),
        quantity:1,unitCents:500,amountCents:500,
      })),subtotalCents:count*500,
      paymentInstructions:"Electronic payment only",
      notes:"Every line is financially material ".repeat(220),
    });
    const short=await PDFDocument.load(await render(2));
    const long=await PDFDocument.load(await render(165));
    expect(short.getPageCount()).toBeGreaterThan(1);
    expect(long.getPageCount()).toBeGreaterThan(short.getPageCount()+2);
  });

  it("ignores an invalid payment QR value", async () => {
    const bytes = await buildInvoicePdf({
      businessName: "Studio",
      familyName: "Lim family",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      currency: "USD",
      items: [{ description: "Lesson", quantity: 1, unitCents: 100, amountCents: 100 }],
      subtotalCents: 100,
      paymentInstructions: "",
      paymentQrCode: "data:image/png;base64,bm90IGEgcG5n",
    });
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });
  it("renders a valid PDF with paid and outstanding balance lines",async()=>{
    const {PDFDocument}=await import("pdf-lib");
    const invoice={
      businessName:"Chess Academy",familyName:"Knight Family",
      periodStart:"2048-03-01",periodEnd:"2048-03-31",currency:"USD",
      items:[{description:"Chess instruction",quantity:1,unitCents:9000,amountCents:9000}],
      subtotalCents:9000,paymentInstructions:"",
    };
    const unpaid=await buildInvoicePdf(invoice);
    const partiallyPaid=await buildInvoicePdf({...invoice,paidCents:3200});
    expect((await PDFDocument.load(partiallyPaid)).getPageCount()).toBe(1);
    expect(partiallyPaid.length).toBeGreaterThan(unpaid.length);
  });

});

describe("multilingual Unicode invoice delivery artifact",()=>{
  it.each(["en","he","ru"] as const)("embeds a valid %s PDF with mixed Hebrew/Cyrillic/Latin family names and financial values",async(locale)=>{
    const {PDFDocument}=await import("pdf-lib");
    const bytes=await buildInvoicePdf({
      locale,businessName:"ChessCoachPal Шахматы שחמט",
      familyName:"יוסף Петров Knight",
      periodStart:"2026-11-01",periodEnd:"2026-11-30",currency:"ILS",
      items:[{description:"שיעור chess Иван — lesson",quantity:1,unitCents:12345,amountCents:12345}],
      subtotalCents:12345,paidCents:2345,
      paymentInstructions:"שלום мир — pay at office",
      notes:"הערה Русский notes with mixed content",
    });
    expect(String.fromCharCode(...bytes.slice(0,4))).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(2500);
    const pdf=await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBeUndefined(); // No personal family data in metadata.
  });
});
