import Link from "next/link";
import {getTranslations} from "next-intl/server";
import { Card } from "@/components/ui/card";
export async function generateMetadata(){
  const t=await getTranslations("hostingPage");return {title:t("metadata")};
}
export default async function HostingPage() {
  const t=await getTranslations("hostingPage");
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-3">{t("title")}</h1>
      <p className="text-muted mb-6">{t("intro")}</p>
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <Card>
          <h2 className="text-lg font-semibold mb-2">{t("selfHost")}</h2>
          <p className="text-sm text-muted">{t("selfHostIntro")}</p>
          <a className="text-primary hover:underline text-sm" href="https://github.com/itshak/ChessCoachPal">{t("source")}</a>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold mb-2">{t("hosted")}</h2>
          <p className="text-sm text-muted">{t("hostedIntro")}</p>
          <Link href="/account" className="text-primary hover:underline text-sm">{t("account")}</Link>
        </Card>
      </div>
      <p className="text-sm text-muted">{t("warning")}</p>
    </main>
  );
}
