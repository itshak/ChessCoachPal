import {getLocale} from "next-intl/server";
import {homeCopy} from "./home-agenda";

export default async function DashboardLoading(){
 const words=homeCopy(await getLocale());
 return <main className="space-y-4" aria-busy="true">
  <h1 className="text-2xl font-semibold">{words.overview}</h1>
  <p role="status" className="text-muted">{words.loading}</p>
 </main>;
}
