import {addDays,toLocalDateString} from "@/lib/schedule";

export type AgendaRow={
 id:string;title:string;starts_at:string;duration_minutes:number;workplace_id:string;
 sessionTimeZone?:string;status?:string;group_id?:string|null;
};
export type DiscoveryRow=AgendaRow&{status:string};
export type AgendaDay={date:string;rows:AgendaRow[];status:"ready"|"unavailable";nextAfter?:string|null};

const fractional=(iso:string)=>(iso.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1]??"").padEnd(9,"0");
const ascending=(a:AgendaRow,b:AgendaRow)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)||
 fractional(a.starts_at).localeCompare(fractional(b.starts_at))||a.id.localeCompare(b.id);

/** These hints are the existing page model's ascending prefix of ALL statuses.
 * Their dates may guide exact daily reads; the hints alone prove no status.
 */
export function verifiedHintDates(hints:readonly {starts_at:string}[],zone:string,today:string){
 return [...new Set(hints.map(row=>toLocalDateString(new Date(row.starts_at),zone)))].filter(date=>date>=today).sort();
}
export function agendaDates(start:string){return Array.from({length:7},(_,i)=>addDays(start,i));}
export function nextWithinVerifiedDays(days:AgendaDay[]):AgendaRow|null {
 for(const day of days){
  if(day.status!=="ready")return null;
  if(day.rows.length)return [...day.rows].sort(ascending)[0];
 }
 return null;
}
export function discoverHome(rows:DiscoveryRow[]|null,now:Date,zone:string,start:string){
 const dates=agendaDates(start), instant=now.getTime();
 // sessionsList is a descending, deterministic 100-record prefix.
 // At a full boundary a tie may have been omitted; require strict earlier evidence.
 const capped=rows!==null&&rows.length>=100;
 const oldest=rows?.length?Math.min(...rows.map(row=>Date.parse(row.starts_at))):Infinity;
 const futureComplete=rows!==null&&(!capped||oldest<instant);
 const allFuture=(rows??[]).filter(row=>row.status==="scheduled"&&Date.parse(row.starts_at)>=instant).sort(ascending);
 const days:AgendaDay[]=dates.map(date=>({
  date,status:rows===null?"unavailable":"ready",
  rows:allFuture.filter(row=>toLocalDateString(new Date(row.starts_at),zone)===date),
 }));
 // The complete future prefix is sufficient for every future calendar window.
 // Otherwise use the established per-date queue, not an unverified partial list.
 const past=(rows??[]).filter(row=>Date.parse(row.starts_at)<instant).sort((a,b)=>-ascending(a,b));
 const next:AgendaRow|null=futureComplete?allFuture[0]??null:null;
 return {days, futureComplete, next,
  historyAvailable:rows!==null,historyPartial:capped||past.filter(row=>row.status==="completed").length>5||past.filter(row=>row.status!=="completed").length>5,
  completed:past.filter(row=>row.status==="completed").slice(0,5),
  otherPast:past.filter(row=>row.status!=="completed").slice(0,5),
 };
}

const translations={
 en:{next:"Next lesson",agenda:"Upcoming agenda",attention:"Needs attention",today:"Today",tomorrow:"Tomorrow",
  later:"No lessons in this seven-day period",noUpcoming:"No upcoming lessons",partial:"Some schedule data is unavailable or incomplete.",
  nextUnknown:"The actual next lesson cannot be verified from the available records.",unavailable:"Schedule unavailable",
  nextWeek:"Next 7 days",previousWeek:"Previous 7 days",currentWeek:"Return to upcoming",calendar:"Calendar",
  completed:"Recently completed",past:"Past schedule — completion not confirmed",historyPartial:"Recent records are limited to the available discovery results.",
  historyUnavailable:"Recent records unavailable",noHistory:"No recent records",prepare:"Prepare lesson",moreDay:"More lessons on this date",
  scheduled:"Scheduled",cancelled:"Cancelled",other:"Other recorded status",workplaceZone:"Lesson timezone",overview:"Home",venueUnavailable:"Workplace name unavailable",localTime:"Lesson local time",materials:"Recorded material",evidence:"Preparation evidence",loading:"Loading coaching records…"},
 he:{next:"השיעור הבא",agenda:"שיעורים קרובים",attention:"דורש טיפול",today:"היום",tomorrow:"מחר",
  later:"אין שיעורים בשבעת הימים האלה",noUpcoming:"אין שיעורים קרובים",partial:"חלק מנתוני היומן אינם זמינים או אינם מלאים.",
  nextUnknown:"לא ניתן לאמת את השיעור הבא בפועל לפי הרשומות הזמינות.",unavailable:"היומן אינו זמין",
  nextWeek:"7 הימים הבאים",previousWeek:"7 הימים הקודמים",currentWeek:"חזרה לשיעורים קרובים",calendar:"יומן",
  completed:"שיעורים שהושלמו לאחרונה",past:"שיעורי עבר — השלמה לא אושרה",historyPartial:"הרשומות האחרונות מוגבלות לתוצאות הזמינות.",
  historyUnavailable:"הרשומות האחרונות אינן זמינות",noHistory:"אין רשומות אחרונות",prepare:"הכנת שיעור",moreDay:"שיעורים נוספים בתאריך זה",
  scheduled:"מתוכנן",cancelled:"בוטל",other:"מצב אחר שנרשם",workplaceZone:"אזור הזמן של השיעור",overview:"בית",venueUnavailable:"שם מקום העבודה אינו זמין",localTime:"זמן מקומי של השיעור",materials:"חומר שנרשם",evidence:"מידע להכנת השיעור",loading:"רשומות ההוראה נטענות…"},
 ru:{next:"Следующий урок",agenda:"Предстоящие уроки",attention:"Требует внимания",today:"Сегодня",tomorrow:"Завтра",
  later:"Нет уроков в этот семидневный период",noUpcoming:"Нет предстоящих уроков",partial:"Часть данных расписания недоступна или неполна.",
  nextUnknown:"Невозможно подтвердить следующий урок по доступным записям.",unavailable:"Расписание недоступно",
  nextWeek:"Следующие 7 дней",previousWeek:"Предыдущие 7 дней",currentWeek:"К предстоящим урокам",calendar:"Календарь",
  completed:"Недавно завершённые",past:"Прошлое расписание — завершение не подтверждено",historyPartial:"Недавние записи ограничены доступными результатами.",
  historyUnavailable:"Недавние записи недоступны",noHistory:"Нет недавних записей",prepare:"Подготовка к уроку",moreDay:"Другие уроки на эту дату",
  scheduled:"Запланирован",cancelled:"Отменён",other:"Другой записанный статус",workplaceZone:"Часовой пояс урока",overview:"Главная",venueUnavailable:"Название места работы недоступно",localTime:"Местное время урока",materials:"Материал по записям",evidence:"Данные для подготовки",loading:"Загрузка учебных записей…"},
};
export function homeCopy(locale:string){
 return translations[locale.startsWith("he")?"he":locale.startsWith("ru")?"ru":"en"];
}
