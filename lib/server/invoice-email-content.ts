import {localeDetails,type AppLocale} from "@/i18n/locales";
import {formatMoney} from "@/lib/billing";
import {invoiceFormatPeriod} from "@/lib/server/invoice-pdf";
import {communicationCopy} from "@/lib/server/communication-locales";

export type InvoiceEmailContentInput={
  locale:AppLocale;familyGreetingName:string;businessName:string;
  periodStart:string;periodEnd:string;currency:string;
  subtotalCents:number;paidCents:number;balanceCents:number;
  paymentInstructions:string;paymentProvider:string;
  hasPaymentQrCode:boolean;checkoutUrl?:string|null;
};

/** One reviewed recipient-localized template for website/MCP preview and real
 * sends. The preview does NOT create a checkout session or send a message.
 * A newly minted Stripe URL can be added only by the approved send path.
 */
export function buildInvoiceEmailContent(input:InvoiceEmailContentInput){
  const {locale}=input;
  const copy=communicationCopy[locale].invoice;
  const periodLabel=invoiceFormatPeriod(input.periodStart,input.periodEnd,locale);
  const studio=input.businessName.trim()||copy.studioFallback;
  const total=formatMoney(input.subtotalCents,input.currency,locale);
  const paid=formatMoney(input.paidCents,input.currency,locale);
  const balance=formatMoney(input.balanceCents,input.currency,locale);
  const summary=input.paidCents>0
    ? `${copy.total}: ${total}\n${copy.paid}: ${paid}\n${copy.balance}: ${balance}`
    : `${copy.totalDue}: ${balance}`;
  const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const isolate=(s:string)=>`<bdi>${escape(s)}</bdi>`;
  const htmlSummary=input.paidCents>0
    ? `<p>${copy.total}: ${isolate(total)}<br/>${copy.paid}: ${isolate(paid)}<br/><strong>${copy.balance}: ${isolate(balance)}</strong></p>`
    : `<p><strong>${copy.totalDue}: ${isolate(balance)}</strong></p>`;
  const qrNote=input.balanceCents>0&&!input.checkoutUrl&&
    input.paymentProvider==="manual"&&input.hasPaymentQrCode ?copy.qrNote:"";
  const payText=input.balanceCents===0?copy.paymentReceived:
    input.checkoutUrl?`${copy.payOnline}: ${input.checkoutUrl}`:
    input.paymentInstructions.trim()
      ? `${copy.paymentInstructions}:\n${input.paymentInstructions.trim()}${qrNote?`\n\n${qrNote}`:""}`
      : qrNote||copy.seePortal;
  const payHtml=input.balanceCents===0?`<p>${copy.paymentReceived}</p>`:
    input.checkoutUrl?`<p><a href="${escape(input.checkoutUrl)}">${copy.payOnline}</a></p>`:
    input.paymentInstructions.trim()
      ? `<p><strong>${copy.paymentInstructions}</strong></p><p style="white-space:pre-wrap;">${escape(input.paymentInstructions.trim())}</p>${qrNote?`<p>${qrNote}</p>`:""}`
      : `<p>${qrNote||copy.seePortal}</p>`;
  return {
    locale,
    subject:copy.subject(periodLabel,studio),
    text:`${copy.greeting(input.familyGreetingName)}\n\n${copy.attached(periodLabel)}\n\n${summary}\n\n${payText}\n\n${copy.signature(studio)}`,
    html:`<div lang="${locale}" dir="${localeDetails[locale].dir}" style="font-family:sans-serif;font-size:14px;line-height:1.5;color:#222;">
<p>${copy.greeting(isolate(input.familyGreetingName))}</p>
<p>${escape(copy.attached(periodLabel))}</p>
${htmlSummary}
${payHtml}
<p>${copy.signature(isolate(studio))}</p>
</div>`,
  };
}
