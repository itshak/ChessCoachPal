import {getLocale,getTranslations} from "next-intl/server";
import {calendarCopy} from "@/components/teacher/schedule/calendar-view";

export default async function CalendarLoading(){
 const [locale,t]=await Promise.all([getLocale(),getTranslations("calendar")]);
 return <main className="space-y-4" aria-busy="true">
  <h1 className="text-2xl font-semibold">{t("heading")}</h1>
  <p role="status" className="text-muted">{calendarCopy(locale).loadingCalendar}</p>
 </main>;
}
