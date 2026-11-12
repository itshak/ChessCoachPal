import { describe, it, expect } from "vitest";
import { buildInvoicePdf, toPdfSafeText } from "@/lib/server/invoice-pdf";

describe("toPdfSafeText", () => {
  it("keeps Latin-1 accents used in names", () => {
    expect(toPdfSafeText("Andrés")).toBe("Andrés");
  });

  it("strips emoji that Helvetica cannot encode", () => {
    expect(toPdfSafeText("Andrés❤️")).toBe("Andrés");
    expect(toPdfSafeText("Lesson — Andrés❤️, Aug 10")).toBe(
      "Lesson - Andrés, Aug 10"
    );
  });

  it("maps common punctuation to WinAnsi-safe ASCII", () => {
    expect(toPdfSafeText("“Hi” – there…")).toBe('"Hi" - there...');
  });
});

describe("buildInvoicePdf", () => {
  it("builds a PDF when a line item includes emoji in the student name", async () => {
    const bytes = await buildInvoicePdf({
      studioName: "Chess Teacher Example",
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
        studioName: "Studio",
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
      studioName:"Synthetic chess studio",
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
      studioName: "Studio",
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
});
