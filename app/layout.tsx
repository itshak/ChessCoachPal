import type {Metadata, Viewport} from "next";
import {Inter, Nunito, Noto_Sans_Hebrew} from "next/font/google";
import {NextIntlClientProvider} from "next-intl";
import {PWA} from "@/lib/pwa";
import {resolveRequestLocale} from "@/i18n/server";
import {messagesFor} from "@/i18n/messages";
import {languageDirection} from "@/i18n/locales";
import {ToastProvider} from "@/components/ui/toast";
import {ConfirmDialogProvider} from "@/components/ui/confirm-dialog";
import {TouchHoverGuard} from "@/components/ui/touch-hover-guard";
import {ServiceWorkerRegistrar} from "@/components/pwa/ServiceWorkerRegistrar";
import "./globals.css";

const inter = Inter({variable: "--font-inter", subsets: ["latin", "cyrillic"]});
const nunito = Nunito({variable: "--font-nunito", subsets: ["latin"]});
const hebrew = Noto_Sans_Hebrew({variable: "--font-hebrew", subsets: ["hebrew"]});

export const viewport: Viewport = {
  themeColor: PWA.themeColor, width: "device-width", initialScale: 1
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();
  const description = {
    en: "AI-first chess teaching assistant: manage students, group and private lessons, attendance, learning history and schedules through your connected AI tools or the web.",
    he: "העוזר החכם למאמני שחמט: ניהול תלמידים, שיעורים פרטיים וקבוצתיים, נוכחות, חומרי לימוד ולוחות זמנים.",
    ru: "ИИ-помощник шахматного тренера: управление учениками, индивидуальными и групповыми занятиями, посещаемостью, учебными материалами и расписанием."
  }[locale];
  return {
    title: {default: "ChessCoachPal", template: "ChessCoachPal - %s"},
    description,
    appleWebApp: {capable: true, statusBarStyle: "black-translucent", title: PWA.shortName},
    icons: {
      icon: [
        {url: "/icon/chesscoachpal.svg", type: "image/svg+xml"},
        {url: "/icon/chesscoachpal-32.png", type: "image/png", sizes: "32x32"},
        {url: "/icon/favicon.ico", type: "image/x-icon", sizes: "any"}
      ],
      apple: "/icon/chesscoachpal-180.png"
    }
  };
}

export default async function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  const locale = await resolveRequestLocale();
  return (
    <html lang={locale} dir={languageDirection(locale)} className="can-hover">
      <body className={`${inter.variable} ${nunito.variable} ${hebrew.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
          <ServiceWorkerRegistrar />
          <TouchHoverGuard />
          <ToastProvider>
            <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
