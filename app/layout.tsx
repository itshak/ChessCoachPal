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
    "Open-source chess coaching assistant for teachers: workplaces, group and private lessons, student attendance, learning observations, and authenticated AI-agent tools",
  appleWebApp: { capable: true, statusBarStyle: "default", title: PWA.shortName },
  icons: {
    icon: "/icon/chesscoachpal.svg",
    apple: "/icon/chesscoachpal.svg", // Keep visible ChessCoachPal identity; PNG fallback can be added after asset review
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
