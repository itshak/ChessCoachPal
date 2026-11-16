import en from "./messages/en.json";
import type {AppLocale} from "./locales";
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof en;
  }
}
