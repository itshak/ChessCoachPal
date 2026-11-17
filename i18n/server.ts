import "server-only";
import {cache} from "react";
import {cookies, headers} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {defaultLocale, isAppLocale, localeCookie, negotiateLocale, type AppLocale} from "./locales";

/** Shared by root HTML and next-intl config; cached per server render. */
export const resolveRequestLocale = cache(async (): Promise<AppLocale> => {
  const jar = await cookies();
  const cookie = jar.get(localeCookie)?.value;
  const hinted = isAppLocale(cookie) ? cookie : negotiateLocale((await headers()).get("accept-language"));
  try {
    const db = await createClient();
    const {data: {user}} = await db.auth.getUser();
    if (!user) return hinted;
    const {data} = await db.from("teachers").select("preferred_locale").eq("id", user.id).maybeSingle();
    return isAppLocale(data?.preferred_locale) ? data.preferred_locale : defaultLocale;
  } catch {
    return hinted;
  }
});
