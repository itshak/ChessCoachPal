import {getTranslations} from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { FamiliesManager } from "@/components/teacher/FamiliesManager";

export async function generateMetadata(){const t=await getTranslations("families");return {title:t("title")};}

export default async function FamiliesPage() {
  const t=await getTranslations("families");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: guardians }, { data: students }] = await Promise.all([
    supabase
      .from("guardians")
      .select(
        "id, name, family_name, email, phone, secondary_name, secondary_email, secondary_phone, email_recipients, portal_token, created_at"
      )
      .eq("teacher_id", user.id)
      .order("name"),
    supabase
      .from("students")
      .select("id, name, guardian_id")
      .eq("teacher_id", user.id)
      .order("name"),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted text-sm mt-1">
          {t("intro")}
        </p>
      </div>
      <FamiliesManager guardians={guardians ?? []} students={students ?? []} />
    </div>
  );
}
