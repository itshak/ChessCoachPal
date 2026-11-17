"use client";
import {useLocale} from "next-intl";
import {useCallback} from "react";
import {localizedApiError} from "./api-error";

/** Returns a locale-safe UI message. The original API result is unchanged. */
export function useLocalizedApiError(){
  const locale=useLocale();
  return useCallback((payload:unknown,fallback:string)=>
    localizedApiError(payload,fallback,locale),[locale]);
}
