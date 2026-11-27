import {defaultLocale,localeDetails,supportedLocale} from "./locales";

/** Localize a display-only calendar date without consulting the viewer's timezone. */
export function formatLocalizedInstantDate(iso:string,locale:string,timeZone:string):string{
 const language=localeDetails[supportedLocale(locale)??defaultLocale].intl;
 return new Intl.DateTimeFormat(language,{timeZone}).format(new Date(iso));
}
