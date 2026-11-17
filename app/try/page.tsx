import Link from "next/link";
import {getTranslations} from "next-intl/server";
import { Card } from "@/components/ui/card";
export async function generateMetadata(){
  const t=await getTranslations("publicTry");return {title:t("title")};
}
export default async function TryPage() {
  const t=await getTranslations("publicTry");
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-3">{t("title")}</h1>
      <p className="text-muted mb-6">{t("intro")}</p>
      <Card>
        <h2 className="font-semibold mb-2">{t("starting")}</h2>
        <p className="text-sm text-muted mb-4">{t("description")}</p>
        <div className="flex gap-4 flex-wrap">
          <Link href="/login" className="font-medium text-primary hover:underline">{t("signIn")}</Link>
          <Link href="/hosting" className="font-medium text-primary hover:underline">{t("hosting")}</Link>
        </div>
      </Card>
      <p className="text-xs text-muted mt-5">{t("privacy")}</p>
    </main>
  );
}
