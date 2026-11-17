import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";

export async function generateMetadata():Promise<Metadata>{
 const t=await getTranslations("termsPage");
 return {title:t("title")};
}
export default async function TermsPage(){
 const t=await getTranslations("termsPage");
 return <article className="max-w-3xl space-y-6 text-sm leading-relaxed [overflow-wrap:anywhere]">
  <header className="space-y-2"><h1 className="text-3xl font-bold">{t("title")}</h1>
   <p className="text-muted">{t("intro")}</p></header>
  <section className="space-y-2"><h2 className="text-xl font-semibold">{t("licenseTitle")}</h2>
   <p>{t("licenseBefore")}{" "}
    <a className="text-primary underline" href="https://github.com/itshak/ChessCoachPal/blob/main/LICENSE">{t("licenseLink")}</a>.
    {" "}{t("licenseMiddle")}{" "}
    <a className="text-primary underline" href="https://github.com/itshak/ChessCoachPal/blob/main/docs/UPSTREAM.md">{t("creditsLink")}</a>.
    {" "}{t("licenseAfter")}</p></section>
  <section className="space-y-2"><h2 className="text-xl font-semibold">{t("hostingTitle")}</h2>
   <p>{t("hostingBody")}</p></section>
  <section className="space-y-2"><h2 className="text-xl font-semibold">{t("responsibleTitle")}</h2>
   <p>{t("responsibleBody")}</p></section>
  <section className="space-y-2"><h2 className="text-xl font-semibold">{t("contractTitle")}</h2>
   <p>{t("contractBody")}</p></section>
 </article>;
}
