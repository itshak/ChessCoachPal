import en from "./messages/en.json";
import he from "./messages/he.json";
import ru from "./messages/ru.json";
import type {AppLocale} from "./locales";

const catalog = {en, he, ru} satisfies Record<AppLocale, typeof en>;
export function messagesFor(locale: AppLocale) {
  return catalog[locale];
}
