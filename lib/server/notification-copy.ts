import {localeDetails,type AppLocale} from "@/i18n/locales";

/** Typed producer-side notification copy. Names/notes are teacher/guardian
 * original text; the localized wrapper must never rewrite them. */
export type NotificationPresentation =
  | {kind:"invoice_paid";family:string;amount:string;periodStart:string;periodEnd:string}
  | {kind:"event_rsvp";family:string;eventTitle:string;status:"yes"|"no"|"maybe";
     partySize:number|null;note:string|null};

const labels:Record<AppLocale,{
  payment:(amount:string)=>string;family:string;amount:string;period:string;method:string;
  rsvp:(family:string,status:string,event:string)=>string;
  partySize:string;note:string; statuses:Record<"yes"|"no"|"maybe",string>;
}>={
  en:{payment:amount=>`Payment received: ${amount}`,family:"Family",amount:"Amount",
    period:"Period",method:"Method: Stripe (paid online)",
    rsvp:(family,status,event)=>`${family} RSVP’d ${status} to ${event}`,
    partySize:"Party size",note:"Note",statuses:{yes:"Yes",no:"No",maybe:"Maybe"}},
  he:{payment:amount=>`התקבל תשלום: ${amount}`,family:"משפחה",amount:"סכום",
    period:"תקופה",method:"אמצעי תשלום: Stripe (תשלום מקוון)",
    rsvp:(family,status,event)=>`${family} השיבו להזמנה לאירוע ${event}: ${status}`,
    partySize:"מספר משתתפים",note:"הערה",statuses:{yes:"כן",no:"לא",maybe:"אולי"}},
  ru:{payment:amount=>`Получен платёж: ${amount}`,family:"Семья",amount:"Сумма",
    period:"Период",method:"Способ оплаты: Stripe (онлайн)",
    rsvp:(family,status,event)=>`${family}: ответ на приглашение «${event}» — ${status}`,
    partySize:"Количество участников",note:"Примечание",statuses:{yes:"Да",no:"Нет",maybe:"Возможно"}},
};

export function localizedNotificationText(input:NotificationPresentation,locale:AppLocale){
  const t=labels[locale];
  if(input.kind==="invoice_paid"){
    const date=new Intl.DateTimeFormat(localeDetails[locale].intl,{timeZone:"UTC",
      year:"numeric",month:"short",day:"numeric"});
    const period=`${date.format(new Date(`${input.periodStart}T12:00:00Z`))} – `+
      date.format(new Date(`${input.periodEnd}T12:00:00Z`));
    return {
      title:t.payment(input.amount),
      body:[`${t.family}: ${input.family}`,`${t.amount}: ${input.amount}`,
        `${t.period}: ${period}`,t.method].join("\n"),
    };
  }
  return {
    title:t.rsvp(input.family,t.statuses[input.status],input.eventTitle),
    body:[input.partySize!=null?`${t.partySize}: ${input.partySize}`:null,
      input.note?`${t.note}: ${input.note}`:null].filter(Boolean).join("\n"),
  };
}
