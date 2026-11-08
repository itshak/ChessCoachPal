import type { Metadata, Viewport } from "next";
import { Inter, Nunito } from "next/font/google";
import { PWA } from "@/lib/pwa";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { TouchHoverGuard } from "@/components/ui/touch-hover-guard";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: PWA.themeColor,
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "ChessCoachPal",
    template: "ChessCoachPal - %s",
  },
  description:
    "AI-first chess teaching assistant: manage students, group and private lessons, attendance, learning history and schedules through your connected AI tools or the web.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: PWA.shortName },
  icons: {
    icon: [
      { url: "/icon/chesscoachpal.svg", type: "image/svg+xml" },
      { url: "/icon/chesscoachpal-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon/favicon.ico", type: "image/x-icon", sizes: "any" },
    ],
    apple: "/icon/chesscoachpal-180.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="can-hover">
      <body className={`${inter.variable} ${nunito.variable} antialiased`}>
        <ServiceWorkerRegistrar />
        <TouchHoverGuard />
        <ToastProvider>
          <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
