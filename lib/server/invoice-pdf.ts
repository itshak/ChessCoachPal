import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {isAppLocale, type AppLocale, localeDetails} from "@/i18n/locales";
import {communicationCopy} from "@/lib/server/communication-locales";
import { formatMoney } from "@/lib/billing";
import { decodePaymentQrDataUrl } from "@/lib/payment-qr";

export interface InvoicePdfItem {
  description: string;
  quantity: number;
  unitCents: number;
  amountCents: number;
}

export interface InvoicePdfInput {
  /** Family communication language, independent of teacher browser locale. */
  locale?: AppLocale;
  businessName: string;
  familyName: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  currency: string;
  items: InvoicePdfItem[];
  subtotalCents: number;
  /** Manual/Stripe payments already received, not the original invoice total. */
  paidCents?: number;
  paymentInstructions: string;
  /** Optional payment QR (data:image/png|jpeg;base64 URL). */
  paymentQrCode?: string | null;
  notes?: string;
}

/** Printed QR edge length (pt); ~1.75in scans reliably from paper or screen. */
const QR_SIZE = 126;

export function invoiceFormatPeriod(start: string, end: string, locale: AppLocale="en"): string {
  const fmt = new Intl.DateTimeFormat(localeDetails[locale].intl, {
    timeZone:"UTC", month:"short", day:"numeric", year:"numeric"
  });
  return `${fmt.format(new Date(`${start}T12:00:00Z`))} – ${fmt.format(new Date(`${end}T12:00:00Z`))}`;
}

const bidi=bidiFactory();
/** pdf-lib paints glyphs in their supplied sequence and does not run Unicode Bidi.
 * Reorder each rendered line, preserving the LTR visual order of sums, dates
 * and embedded Latin names in a Hebrew RTL paragraph. */
export function invoiceVisualText(text:string, locale:AppLocale):string {
  return bidi.getReorderedString(text,bidi.getEmbeddingLevels(text,locale==="he"?"rtl":"ltr"));
}

/** Split in actual on-page visual order. fontkit's own shaping otherwise
 * reverses an ENTIRE mixed-script PDF text operation when it begins with
 * Hebrew, corrupting adjacent Latin/Cyrillic names and financial notes.
 * Each Hebrew run is sent separately in logical order for font shaping.
 */
export function invoiceVisualRuns(text:string,locale:AppLocale):string[]{
  const display=invoiceVisualText(text,locale);
  const segments=display.match(/[\p{Script=Hebrew}\p{M}]+|[^\p{Script=Hebrew}\p{M}]+/gu)??[];
  return segments.map(segment=>/[\p{Script=Hebrew}]/u.test(segment)
    ?Array.from(segment).reverse().join("")
    :segment);
}

/** Generate a simple invoice PDF buffer. */
export async function buildInvoicePdf(
  input: InvoicePdfInput
): Promise<Uint8Array> {
  const locale=isAppLocale(input.locale)?input.locale:"en";
  const labels=communicationCopy[locale].invoice;
  const rtl=locale==="he";
  const doc = await PDFDocument.create();
  doc.setLanguage(localeDetails[locale].intl);
  doc.registerFontkit(fontkit);
  // Embedded, redistributed Bitstream/DejaVu Unicode fonts. Helvetica silently
  // discarded all Hebrew/Cyrillic and turned mixed-script recipient names blank.
  const [regularBytes,boldBytes]=await Promise.all([
    readFile(join(process.cwd(),"assets/fonts/DejaVuSans.ttf")),
    readFile(join(process.cwd(),"assets/fonts/DejaVuSans-Bold.ttf"))
  ]);
  const font=await doc.embedFont(regularBytes,{subset:true});
  const bold=await doc.embedFont(boldBytes,{subset:true});
  let page = doc.addPage([612, 792]); // US Letter
  const { height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  const textRuns=(value:string)=>invoiceVisualRuns(
    // Keep Unicode letters, punctuation, marks and digits. Unavailable emoji
    // print .notdef squares; unlike the old helper no name characters vanish.
    value.normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,""),locale);
  const width=(text:string,f:PDFFont,size:number)=>textRuns(text)
    .reduce((sum,run)=>sum+f.widthOfTextAtSize(run,size),0);
  const drawAt=(target:PDFPage,text:string,x:number,lineY:number,size:number,
    f:PDFFont,color:ReturnType<typeof rgb>)=>{
      let cursor=x;
      for(const run of textRuns(text)){
        target.drawText(run,{x:cursor,y:lineY,size,font:f,color});
        cursor+=f.widthOfTextAtSize(run,size);
      }
  };
  const draw = (
    text: string,
    opts: {
      size?: number;
      font?: PDFFont;
      /** The internal 480 sentinel marks the numeric column. */
      x?: number;
      color?: ReturnType<typeof rgb>;
    } = {}
  ) => {
    const size=opts.size??11;
    const f=opts.font??font;
    const isAmount=opts.x===480;
    const rightAligned=rtl?!isAmount:isAmount;
    const anchor=isAmount?(rtl?margin:612-margin):(rtl?612-margin:margin);
    const x=rightAligned?anchor-width(text,f,size):anchor;
    drawAt(page,text,x,y,size,f,opts.color ?? rgb(0.1,0.1,0.1));
  };
  const truncate=(text:string,maxWidth:number,size=10)=>{
    const chars=Array.from(text), ellipsis="…";
    let prefix="";
    for(const ch of chars){
      if(width(prefix+ch,font,size)>maxWidth){
        return prefix+ellipsis;
      }
      prefix+=ch;
    }
    return prefix;
  };

  const studio = input.businessName.trim() || "Studio";
  draw(studio, { size: 18, font: bold });
  y -= 22;
  draw(labels.heading, { size: 14, font: bold, color: rgb(0.3, 0.3, 0.3) });
  y -= 28;

  draw(`${labels.family}: ${input.familyName}`, { font: bold });
  y -= 16;
  draw(`${labels.period}: ${invoiceFormatPeriod(input.periodStart, input.periodEnd,locale)}`);
  y -= 28;

  // Column headers
  draw(labels.description, { font: bold, size: 10 });
  draw(labels.amount, { font: bold, size: 10, x: 480 });
  y -= 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 612 - margin, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 16;

  // Every invoice line is financially material: never silently omit lines
  // merely because the first page ran out of room. Repeat column headings.
  const continuePage = () => {
    page = doc.addPage([612, 792]);
    y = height - margin;
    draw(labels.continued, {font:bold,size:13});
    y -= 30;
    draw(labels.description, {font:bold,size:10});
    draw(labels.amount, {font:bold,size:10,x:480});
    y -= 18;
  };
  for (const item of input.items) {
    if (y < 110) continuePage();
    // Font-width clipping prevents translated and mixed-direction descriptions
    // from overlapping the immutable monetary amount on either side.
    draw(truncate(item.description,390,10), { size: 10 });
    draw(formatMoney(item.amountCents, input.currency,locale), {
      size: 10,
      x: 480,
    });
    y -= 14;
  }

  if(y<110){
    page=doc.addPage([612,792]);
    y=height-margin;
  }
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 612 - margin, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 20;
  draw(labels.total, { font: bold, size: 12 });
  draw(formatMoney(input.subtotalCents, input.currency,locale), {
    font: bold,
    size: 12,
    x: 480,
  });
  if ((input.paidCents ?? 0) > 0) {
    if (y < 105) {
      page = doc.addPage([612, 792]);
      y = height - margin;
    }
    y -= 17;
    draw(labels.paid, { size: 11 });
    draw(formatMoney(input.paidCents ?? 0, input.currency,locale), { size: 11, x: 480 });
    y -= 18;
    draw(labels.balance, { font: bold, size: 11 });
    draw(formatMoney(Math.max(0, input.subtotalCents - (input.paidCents ?? 0)), input.currency,locale), {
      font: bold, size: 11, x: 480,
    });
  }

  const qr = decodePaymentQrDataUrl(input.paymentQrCode);
  const qrImage = qr
    ? qr.format === "png"
      ? await doc.embedPng(qr.bytes)
      : await doc.embedJpg(qr.bytes)
    : null;

  if (input.paymentInstructions.trim() || qrImage) {
    // Keep the QR whole: move the payment block to a new page if it won't fit.
    if (qrImage && y - 50 - QR_SIZE < margin) {
      page = doc.addPage([612, 792]);
      y = height - margin + 36;
    }
    y -= 36;
    draw(labels.paymentInstructions, { font: bold, size: 11 });
    const headerY = y;
    const qrInstructionPage=page;
    y -= 14;
    // Wrap text beside the QR code when there is one.
    for (const line of wrapPdfText(input.paymentInstructions, qrImage ? 300 : 500, font, 10, width)) {
      if(y<60){
        // Keep QR with its instruction heading, and paginate a large note
        // rather than discarding instructions after the first sheet.
        page=doc.addPage([612,792]);
        y=height-margin;
      }
      draw(line, { size: 10 });
      y -= 13;
    }
    if (qrImage) {
      const scale = Math.min(QR_SIZE / qrImage.width, QR_SIZE / qrImage.height);
      const w = qrImage.width * scale;
      const h = qrImage.height * scale;
      // On RTL invoices the QR occupies the LEFT side: instructions align
      // to the right, so the two blocks must not share horizontal space.
      const x = rtl ? margin : 612 - margin - w;
      const bottom = headerY + 10 - h;
      qrInstructionPage.drawImage(qrImage, { x, y: bottom, width: w, height: h });
      const caption = labels.scanToPay;
      drawAt(qrInstructionPage,caption,x+w/2-width(caption,font,9)/2,bottom-12,
        9,font,rgb(0.4,0.4,0.4));
      if(page===qrInstructionPage)y = Math.min(y, bottom - 12);
    }
  }

  if (input.notes?.trim()) {
    if(y<100){
      page=doc.addPage([612,792]);
      y=height-margin;
    }
    y -= 20;
    draw(labels.notes, { font: bold, size: 11 });
    y -= 14;
    for (const line of wrapPdfText(input.notes, 500, font, 10, width)) {
      if(y<60){
        page=doc.addPage([612,792]);
        y=height-margin;
        draw(`${labels.notes} (${labels.continued})`,{font:bold,size:11});
        y-=18;
      }
      draw(line, { size: 10 });
      y -= 13;
    }
  }

  return doc.save();
}

/** Wrap human-authored paragraphs by actual embedded font width. Unlike the
 * earlier character-count heuristic this handles Hebrew and long Cyrillic
 * strings without truncating invoice notes or payment instructions. */
function wrapPdfText(text:string,maxWidth:number,font:PDFFont,size:number,
  width:(text:string,f:PDFFont,size:number)=>number):string[]{
  const lines:string[]=[];
  for(const paragraph of text.replace(/\r\n/g,"\n").split("\n")){
    if(!paragraph.trim()){lines.push("");continue;}
    let current="";
    for(const word of paragraph.split(/\s+/)){
      let candidate=current?`${current} ${word}`:word;
      if(width(candidate,font,size)>maxWidth&&current){
        lines.push(current);current="";candidate=word;
      }
      // Break long unspaced URLs/words at safe Unicode codepoint boundaries.
      while(width(candidate,font,size)>maxWidth){
        let segment="";
        for(const ch of candidate){
          if(width(segment+ch,font,size)>maxWidth)break;
          segment+=ch;
        }
        if(!segment)break;
        lines.push(segment);candidate=candidate.slice(segment.length);
      }
      current=candidate;
    }
    if(current)lines.push(current);
  }
  return lines;
}
