import {isAppLocale, type AppLocale} from "./locales";

/**
 * Convert an API/agent result to display text without changing the wire
 * error code or backend diagnostic. A machine error is NEVER assumed to be
 * safe, localized user copy. Keep its stable, public code for support.
 * English preserves legacy diagnostics for existing prelaunch clients.
 */
const codeCopy:Record<AppLocale,Record<string,string>>={
  en:{
    VALIDATION_ERROR:"Please check the entered values",
    INVALID_LOCALE:"Unsupported language",
    UNAUTHORIZED:"Sign in to continue",
    FORBIDDEN:"You do not have permission for this action",
    NOT_FOUND:"The requested item was not found",
    REQUEST_CONFLICT:"The information changed; refresh and try again",
    CONFLICT:"The information changed; refresh and try again",
    HOSTED_LIMIT_REACHED:"Active student limit reached",
    RATE_LIMITED:"Too many requests; try again later",
    CONFIRMATION_REQUIRED:"Please confirm this action before proceeding",
    NOT_CONFIGURED:"This integration has not been configured",
    INSUFFICIENT_SCOPE:"The connected assistant lacks permission",
    AMBIGUOUS_NAME:"More than one student matches this name; choose the exact student",
    IMPORT_REPLAY_CONFLICT:"This import identifier was reused for different data",
  },
  he:{
    VALIDATION_ERROR:"בדקו את הערכים שהוזנו",
    INVALID_LOCALE:"השפה שנבחרה אינה נתמכת",
    UNAUTHORIZED:"יש להתחבר כדי להמשיך",
    FORBIDDEN:"אין הרשאה לבצע פעולה זו",
    NOT_FOUND:"הפריט המבוקש לא נמצא",
    REQUEST_CONFLICT:"המידע השתנה. רעננו את הדף ונסו שוב",
    CONFLICT:"המידע השתנה. רעננו את הדף ונסו שוב",
    HOSTED_LIMIT_REACHED:"הגעתם למגבלת התלמידים הפעילים",
    RATE_LIMITED:"בוצעו יותר מדי בקשות. נסו שוב מאוחר יותר",
    CONFIRMATION_REQUIRED:"יש לאשר את הפעולה לפני שממשיכים",
    NOT_CONFIGURED:"החיבור לשירות טרם הוגדר",
    INSUFFICIENT_SCOPE:"לעוזר המחובר אין הרשאה מספקת",
    AMBIGUOUS_NAME:"נמצאו כמה תלמידים בשם הזה. בחרו תלמיד מדויק",
    IMPORT_REPLAY_CONFLICT:"נעשה שימוש חוזר במזהה ייבוא עבור נתונים שונים",
  },
  ru:{
    VALIDATION_ERROR:"Проверьте введённые данные",
    INVALID_LOCALE:"Выбранный язык не поддерживается",
    UNAUTHORIZED:"Войдите, чтобы продолжить",
    FORBIDDEN:"Недостаточно прав для этого действия",
    NOT_FOUND:"Запрошенная запись не найдена",
    REQUEST_CONFLICT:"Данные изменились. Обновите страницу и повторите попытку",
    CONFLICT:"Данные изменились. Обновите страницу и повторите попытку",
    HOSTED_LIMIT_REACHED:"Достигнут лимит активных учеников",
    RATE_LIMITED:"Слишком много запросов. Попробуйте позже",
    CONFIRMATION_REQUIRED:"Подтвердите действие, прежде чем продолжить",
    NOT_CONFIGURED:"Подключение ещё не настроено",
    INSUFFICIENT_SCOPE:"У подключённого помощника недостаточно прав",
    AMBIGUOUS_NAME:"Найдено несколько учеников с таким именем. Выберите нужного",
    IMPORT_REPLAY_CONFLICT:"Идентификатор импорта повторно использован с другими данными",
  }
};

export function localizedApiError(payload:unknown,fallback:string,locale:unknown):string{
  const selected=isAppLocale(locale)?locale:"en";
  const row=payload&&typeof payload==="object"&&!Array.isArray(payload)
    ?payload as Record<string,unknown>:{error:payload};
  const message=typeof row.error==="string"?row.error.trim():
    payload instanceof Error?payload.message.trim():"";
  const code=typeof row.code==="string"&&/^[A-Z][A-Z0-9_]{2,63}$/.test(row.code)
    ?row.code:"";
  if(selected==="en")return message||codeCopy.en[code]||fallback;
  const translated=code?codeCopy[selected][code]:undefined;
  if(translated)return translated;
  return code?`${fallback} (${code})`:fallback;
}
