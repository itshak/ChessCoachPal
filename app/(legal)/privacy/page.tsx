import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";

export async function generateMetadata():Promise<Metadata>{
 const t=await getTranslations("privacyPage");
 return {title:t("title")};
}
export default async function PrivacyPage(){
 const t=await getTranslations("privacyPage");
 return <article className="max-w-3xl space-y-6 text-sm leading-relaxed [overflow-wrap:anywhere]">
  <header className="space-y-2"><h1 className="text-3xl font-bold">{t("title")}</h1>
   <p className="text-muted">{t("intro")}</p></header>
  <section className="space-y-2"><h2 className="text-xl font-semibold">{t("operatorTitle")}</h2>
   <p>{t("operatorBody")}</p></section>
  <section className="space-y-2"><h2 className="text-xl font-semibold">{t("storedTitle")}</h2>
   <p>{t("storedBody")}</p><p>{t("authBody")}</p></section>
  <section className="space-y-2"><h2 className="text-xl font-semibold">{t("childrenTitle")}</h2>
   <p>{t("childrenBody")}</p></section>
  <section className="space-y-2"><h2 className="text-xl font-semibold">{t("retentionTitle")}</h2>
   <p>{t("retentionBody")}</p>
   <p>{t("securityBefore")}{" "}
    <a className="text-primary underline" href="https://github.com/itshak/ChessCoachPal/blob/main/docs/SECURITY.md">{t("securityLink")}</a>
    {" "}{t("securityAfter")}</p></section>
 </article>;
}
