import Link from "next/link";
import {useTranslations} from "next-intl";
import {BrandMark} from "@/components/brand/BrandMark";
import {LanguageSwitcher} from "@/components/locale/LanguageSwitcher";

const features = ["f1","f2","f3","f4"] as const;

export default function LandingPage() {
  const t=useTranslations("landing");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 font-bold text-lg text-primary">
            <BrandMark size={36} className="h-9 w-9" alt="" />
            ChessCoachPal
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher compact />
            <Link href="/login" className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold">{t("login")}</Link>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 py-14">
        <section className="max-w-3xl space-y-5">
          <p className="font-semibold text-primary">{t("eyebrow")}</p>
          <h1 className="font-bold text-4xl md:text-6xl tracking-tight leading-tight">{t("headline")}</h1>
          <p className="text-lg text-muted">{t("intro")}</p>
          <p className="text-sm text-muted">{t("notice")}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className="rounded-lg bg-primary text-white px-5 py-3 font-semibold">{t("open")}</Link>
            <a href="https://github.com/itshak/ChessCoachPal" className="rounded-lg border border-border px-5 py-3 font-semibold">{t("source")}</a>
          </div>
        </section>
        <section className="mt-14 grid gap-4 md:grid-cols-2">
          {features.map(key => (
            <article key={key} className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-semibold text-lg">{t((key+"Title") as "f1Title"|"f2Title"|"f3Title"|"f4Title")}</h2>
              <p className="text-muted mt-2">{t((key+"Detail") as "f1Detail"|"f2Detail"|"f3Detail"|"f4Detail")}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted">{t("credits")}</footer>
    </div>
  );
}
