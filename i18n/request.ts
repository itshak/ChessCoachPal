import {getRequestConfig} from "next-intl/server";
import {resolveRequestLocale} from "./server";
import {messagesFor} from "./messages";
export default getRequestConfig(async () => {
  const locale = await resolveRequestLocale();
  return {locale, messages: messagesFor(locale)};
});
