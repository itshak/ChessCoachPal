import type { MetadataRoute } from "next";
import { PWA } from "@/lib/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PWA.name,
    short_name: PWA.shortName,
    description: PWA.description,
    start_url: PWA.startUrl,
    scope: PWA.scope,
    display: "standalone",
    background_color: PWA.backgroundColor,
    theme_color: PWA.themeColor,
    icons: [
      { src: "/icon/chesscoachpal.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
