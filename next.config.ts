import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const SECURITY_HEADERS = [
  // Two years, per hstspreload.org guidance.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // SAMEORIGIN (not DENY): the app frames its own PDF score viewer.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Standalone for container builds. Vercel injects a deployment adapter that
  // breaks with standalone on Next 16.3.x (vercel/next.js#96646) — skip it there.
  // A local `npm run build` now emits .next/standalone as well; nothing reads it
  // outside a container.
  output: process.env.VERCEL ? undefined : "standalone",
  // Unicode invoice fonts must exist in Vercel functions and standalone images.
  outputFileTracingIncludes: {"/*": ["./assets/fonts/*.ttf"]},
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/portal/:token", headers: [
        {key:"Cache-Control",value:"private, no-store, max-age=0"},
        {key:"Referrer-Policy",value:"no-referrer"},
        {key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"},
      ]},
      { source: "/api/portal/:path*", headers: [
        {key:"Cache-Control",value:"private, no-store, max-age=0"},
        {key:"Referrer-Policy",value:"no-referrer"},
      ]},
    ];
  },
  async redirects() {
    return [
      { source: "/pricing", destination: "/hosting", permanent: true },
    ];
  },
};

export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
