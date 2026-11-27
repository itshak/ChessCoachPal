import {addDays,startOfWeek} from "@/lib/schedule";

export type CalendarView = "auto" | "agenda" | "week" | "month" | "day";
export function calendarView(value:unknown):CalendarView {
 return value==="agenda"||value==="week"||value==="month"||value==="day"?value:"auto";
}
export function calendarRange(anchor:string,view:CalendarView){
 const first=anchor.slice(0,7)+"-01";
 const nextMonth=(delta:number)=>{
  const date=new Date(first+"T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth()+delta);
  return date.toISOString().slice(0,10);
 };
 if(view==="month"){
  return {start:startOfWeek(first),end:addDays(startOfWeek(addDays(nextMonth(1),-1)),6),
   previous:nextMonth(-1),next:nextMonth(1)};
 }
 if(view==="day")return {start:anchor,end:anchor,previous:addDays(anchor,-1),next:addDays(anchor,1)};
 const start=startOfWeek(anchor);
 return {start,end:addDays(start,6),previous:addDays(start,-7),next:addDays(start,7)};
}
export function calendarHref(date:string,view:CalendarView){
 return "/schedule?"+new URLSearchParams({week:date,...(view==="auto"?{}:{view})});
}
export function calendarDates(start:string,end:string){
 const dates:string[]=[];
 for(let day=start;day<=end;day=addDays(day,1))dates.push(day);
 return dates;
}

// Owned by the Calendar feature until the shared message catalogs are integrated.
const copy={
 en:{agenda:"Agenda",week:"Week",month:"Month",day:"Day",view:"Calendar view",empty:"No lessons or events",details:"Lesson details",date:"Choose date",unavailable:"Calendar unavailable",back:"Back to calendar"},
 he:{agenda:"סדר יום",week:"שבוע",month:"חודש",day:"יום",view:"תצוגת יומן",empty:"אין שיעורים או אירועים",details:"פרטי שיעור",date:"בחירת תאריך",unavailable:"היומן אינו זמין",back:"חזרה ליומן"},
 ru:{agenda:"Список",week:"Неделя",month:"Месяц",day:"День",view:"Вид календаря",empty:"Нет уроков или событий",details:"Подробности урока",date:"Выбрать дату",unavailable:"Календарь недоступен",back:"Вернуться к календарю"},
};
export function calendarCopy(locale:string){
 return copy[locale.startsWith("he")?"he":locale.startsWith("ru")?"ru":"en"];
}
