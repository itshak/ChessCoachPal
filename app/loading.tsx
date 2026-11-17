"use client";

import {useTranslations} from "next-intl";
import {AppLoadingScreen} from "@/components/brand/AppLoadingScreen";

export default function RootLoading(){
  const t=useTranslations("systemUi");
  return <AppLoadingScreen message={t("loading")}/>;
}
