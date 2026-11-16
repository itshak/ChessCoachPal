export const locales = ["en", "he", "ru"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "en";
export const localeCookie = "ccp_locale";

export const localeDetails: Record<AppLocale, {name: string; dir: "ltr" | "rtl"; intl: string}> = {
  en: {name: "English", dir: "ltr", intl: "en-US"},
  he: {name: "עברית", dir: "rtl", intl: "he-IL"},
  ru: {name: "Русский", dir: "ltr", intl: "ru-RU"}
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
export function languageDirection(locale: AppLocale): "ltr" | "rtl" {
  return localeDetails[locale].dir;
}
/** A workplace can use a region tag, but only translated base languages are selected. */
export function supportedLocale(value: unknown): AppLocale | null {
  if (typeof value !== "string") return null;
  const base = value.split("-")[0]?.toLowerCase();
  return isAppLocale(base) ? base : null;
}
/** Browser preference is only a hint; never overwrite saved teacher preference. */
export function negotiateLocale(header: string | null): AppLocale {
  if (!header) return defaultLocale;
  const ranked = header.split(",").map(part => {
    const [tag, quality] = part.trim().split(";q=");
    const q = quality === undefined ? 1 : Number(quality);
    return {locale: supportedLocale(tag), q: Number.isFinite(q) ? q : 0};
  }).sort((a, b) => b.q - a.q);
  return ranked.find(x => x.locale && x.q > 0)?.locale ?? defaultLocale;
}
