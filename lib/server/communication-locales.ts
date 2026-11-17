import {isAppLocale, type AppLocale} from "@/i18n/locales";

/** Family-facing communications are NOT controlled by the teacher's UI cookie.
 * This family-level explicit choice may be null; English is then the
 * documented, deterministic studio-communications default. */
export function familyCommunicationLocale(family: {preferred_locale?: string|null}): AppLocale {
  return isAppLocale(family.preferred_locale) ? family.preferred_locale : "en";
}

export const communicationCopy: Record<AppLocale,{
  portalFooter: string; portalLink: string;
  event: {invite:(title:string)=>string;reminder:(title:string)=>string;
    introInvite:(title:string)=>string;introReminder:(title:string)=>string;
    inviteCta:string;reminderCta:string;when:string;where:string;performing:string;
    greeting:(name:string)=>string; signature:(studio:string)=>string};
  invoice:{heading:string;continued:string;family:string;period:string;studioFallback:string;description:string;
    amount:string;total:string;paid:string;balance:string;paymentInstructions:string;
    notes:string;scanToPay:string;subject:(period:string,studio:string)=>string;
    greeting:(name:string)=>string;attached:(period:string)=>string;
    totalDue:string;paymentReceived:string;payOnline:string;qrNote:string;
    seePortal:string;signature:(studio:string)=>string};
  notification:{receipt:string;viewInvoice:string;openInApp:string};
  outbox:{studentCancelled:string;studentCancelNotice:string;student:string;when:string;
    reason:string;reviewAttendance:string;lessonNotes:(student:string)=>string;
    lessonNotesIntro:(studio:string,student:string,when:string)=>string;
    lessonCancelled:(student:string)=>string;
    lessonCancelIntro:(studio:string,student:string,when:string)=>string;
    reviewPortal:string;};
}> = {
  en:{
    portalFooter:"Your family portal: schedule and teaching notes:",
    portalLink:"Your family portal",event:{
      invite:title=>title,reminder:title=>`Reminder: ${title} is tomorrow`,
      introInvite:title=>`You're invited to ${title}.`,
      introReminder:title=>`This is a reminder that ${title} is tomorrow.`,
      inviteCta:"Please RSVP in your family portal.",
      reminderCta:"Details and RSVP are in your family portal.",
      when:"When",where:"Location",performing:"Performing",
      greeting:name=>`Hi ${name},`,
      signature:studio=>studio?`— ${studio} (sent via ChessCoachPal Studio)`:
        "— Sent via ChessCoachPal Studio"},
    invoice:{heading:"Invoice",continued:"Invoice (continued)",family:"Family",period:"Period",studioFallback:"your studio",
      description:"Description",amount:"Amount",total:"Total",paid:"Paid",balance:"Balance due",
      paymentInstructions:"Payment instructions",notes:"Notes",scanToPay:"Scan to pay",
      subject:(period,studio)=>`Invoice for ${period} - ${studio}`,
      greeting:name=>`Hi ${name},`,attached:period=>`Please find attached your invoice for ${period}.`,
      totalDue:"Total due",paymentReceived:"Payment received in full. No further payment is due.",
      payOnline:"Pay online",qrNote:"A payment QR code is included on the attached invoice.",
      seePortal:"See your family portal for payment details.",
      signature:studio=>`— ${studio} (sent via ChessCoachPal Studio)`},
    notification:{receipt:"Payment receipt",viewInvoice:"View invoice",openInApp:"Open in ChessCoachPal"},
    outbox:{studentCancelled:"Chess lesson cancelled by a student",studentCancelNotice:"Student cancellation notice",
      student:"Student",when:"When",reason:"Reason",reviewAttendance:"Review the attendance register in your ChessCoachPal schedule.",
      lessonNotes:student=>`Chess lesson notes for ${student}`,
      lessonNotesIntro:(studio,student,when)=>`Here are the notes shared by ${studio} for ${student}'s chess lesson on ${when}:`,
      lessonCancelled:student=>`Chess lesson cancelled — ${student}`,
      lessonCancelIntro:(studio,student,when)=>`${studio} cancelled ${student}'s chess lesson on ${when}`,
      reviewPortal:"Please review your family portal for the updated schedule."}
  },
  he:{
    portalFooter:"הפורטל המשפחתי: לוח הזמנים והערות השיעור:",portalLink:"הפורטל המשפחתי",
    event:{invite:title=>title,reminder:title=>`תזכורת: ${title} מתקיים מחר`,
      introInvite:title=>`הנכם מוזמנים לאירוע: ${title}.`,
      introReminder:title=>`תזכורת: האירוע ${title} מתקיים מחר.`,
      inviteCta:"נא לאשר השתתפות בפורטל המשפחתי.",
      reminderCta:"הפרטים ואישור ההשתתפות זמינים בפורטל המשפחתי.",
      when:"מתי",where:"מיקום",performing:"משתתפים",
      greeting:name=>`שלום ${name},`,
      signature:studio=>studio?`— ${studio} (נשלח באמצעות ChessCoachPal Studio)`:
        "— נשלח באמצעות ChessCoachPal Studio"},
    invoice:{heading:"חשבונית",continued:"חשבונית (המשך)",family:"משפחה",period:"תקופה",studioFallback:"הסטודיו שלכם",
      description:"תיאור",amount:"סכום",total:"סך הכול",paid:"שולם",balance:"יתרה לתשלום",
      paymentInstructions:"הוראות תשלום",notes:"הערות",scanToPay:"סריקה לתשלום",
      subject:(period,studio)=>`חשבונית לתקופה ${period} — ${studio}`,
      greeting:name=>`שלום ${name},`,attached:period=>`מצורפת חשבונית לתקופה ${period}.`,
      totalDue:"סכום לתשלום",paymentReceived:"התשלום התקבל במלואו. אין יתרה לתשלום.",
      payOnline:"תשלום מקוון",qrNote:"קוד QR לתשלום מופיע בחשבונית המצורפת.",
      seePortal:"פרטי התשלום זמינים בפורטל המשפחתי.",
      signature:studio=>`— ${studio} (נשלח באמצעות ChessCoachPal Studio)`},
    notification:{receipt:"אישור תשלום",viewInvoice:"צפייה בחשבונית",openInApp:"פתיחה ב-ChessCoachPal"},
    outbox:{studentCancelled:"תלמיד ביטל שיעור שחמט",studentCancelNotice:"הודעה על ביטול שיעור מצד התלמיד",
      student:"תלמיד",when:"מתי",reason:"סיבה",reviewAttendance:"אפשר לעיין ברישום הנוכחות בלוח הזמנים ב-ChessCoachPal.",
      lessonNotes:student=>`הערות משיעור שחמט עבור ${student}`,
      lessonNotesIntro:(studio,student,when)=>`אלו ההערות ש-${studio} שיתף לגבי שיעור השחמט של ${student} בתאריך ${when}:`,
      lessonCancelled:student=>`שיעור שחמט בוטל — ${student}`,
      lessonCancelIntro:(studio,student,when)=>`${studio} ביטל את שיעור השחמט של ${student} בתאריך ${when}`,
      reviewPortal:"נא לעיין בפורטל המשפחתי כדי לראות את לוח הזמנים המעודכן."}
  },
  ru:{
    portalFooter:"Семейный портал: расписание и заметки об уроках:",portalLink:"Семейный портал",
    event:{invite:title=>title,reminder:title=>`Напоминание: ${title} завтра`,
      introInvite:title=>`Приглашаем вас на мероприятие «${title}».`,
      introReminder:title=>`Напоминаем: мероприятие «${title}» состоится завтра.`,
      inviteCta:"Пожалуйста, подтвердите участие в семейном портале.",
      reminderCta:"Подробности и подтверждение участия доступны в семейном портале.",
      when:"Когда",where:"Место",performing:"Выступают",
      greeting:name=>`Здравствуйте, ${name}!`,
      signature:studio=>studio?`— ${studio} (отправлено через ChessCoachPal Studio)`:
        "— Отправлено через ChessCoachPal Studio"},
    invoice:{heading:"Счёт",continued:"Счёт (продолжение)",family:"Семья",period:"Период",studioFallback:"ваша школа",
      description:"Описание",amount:"Сумма",total:"Итого",paid:"Оплачено",balance:"Остаток к оплате",
      paymentInstructions:"Инструкции по оплате",notes:"Примечания",scanToPay:"Сканируйте для оплаты",
      subject:(period,studio)=>`Счёт за ${period} — ${studio}`,
      greeting:name=>`Здравствуйте, ${name}!`,attached:period=>`Во вложении счёт за период ${period}.`,
      totalDue:"К оплате",paymentReceived:"Оплата получена полностью. Доплата не требуется.",
      payOnline:"Оплатить онлайн",qrNote:"QR-код для оплаты находится в приложенном счёте.",
      seePortal:"Подробности об оплате доступны в семейном портале.",
      signature:studio=>`— ${studio} (отправлено через ChessCoachPal Studio)`},
    notification:{receipt:"Квитанция об оплате",viewInvoice:"Открыть счёт",openInApp:"Открыть в ChessCoachPal"},
    outbox:{studentCancelled:"Ученик отменил шахматное занятие",studentCancelNotice:"Уведомление об отмене занятия учеником",
      student:"Ученик",when:"Когда",reason:"Причина",reviewAttendance:"Проверьте журнал посещаемости в расписании ChessCoachPal.",
      lessonNotes:student=>`Заметки о шахматном занятии: ${student}`,
      lessonNotesIntro:(studio,student,when)=>`${studio} поделился заметками о шахматном занятии ученика ${student} от ${when}:`,
      lessonCancelled:student=>`Шахматное занятие отменено — ${student}`,
      lessonCancelIntro:(studio,student,when)=>`${studio} отменил шахматное занятие ученика ${student}, назначенное на ${when}`,
      reviewPortal:"Проверьте обновлённое расписание в семейном портале."}
  }
};
