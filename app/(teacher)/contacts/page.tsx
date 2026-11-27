import {getTranslations} from "next-intl/server";
import {ContactsManager} from "@/components/teacher/ContactsManager";

export async function generateMetadata(){
  const t=await getTranslations("contacts");
  return {title:t("title")};
}
export default async function ContactsPage(){
  const t=await getTranslations("contacts");
  return <div className="max-w-6xl">
    <header className="mb-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>
    </header>
    <ContactsManager/>
  </div>;
}
