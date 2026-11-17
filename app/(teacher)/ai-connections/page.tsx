import { createClient } from "@/lib/supabase/server";
import { AgentConnections } from "@/components/teacher/AgentConnections";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
export async function generateMetadata(){const t=await getTranslations("connectionsPage");return {title:t("title")};}
export default async function Page() {
  const t=await getTranslations("connectionsPage");
  const db = await createClient();
  const {data:{user}}=await db.auth.getUser();
  if (!user) return null;
  return <main className="max-w-xl mx-auto space-y-4">
    <h1 className="text-2xl font-bold">{t("title")}</h1>
    <p>{t("description")}</p>
    <AgentConnections />
    <Link href="/account" className="underline">{t("back")}</Link>
  </main>;
}
