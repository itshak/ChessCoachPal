import {getTranslations} from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getPolicy } from "@/lib/server/scheduling";
import { BusinessSettingsForm } from "@/components/teacher/settings/BusinessSettingsForm";
import { PolicySettings } from "@/components/teacher/schedule/PolicySettings";
import { BillingSettingsForm } from "@/components/teacher/settings/BillingSettingsForm";

export async function generateMetadata(){const t=await getTranslations("teacherSettingsPage");return {title:t("title")};}

export default async function TeacherSettingsPage() {
  const t=await getTranslations("teacherSettingsPage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const policy = await getPolicy(supabase, user.id);
  // Never pass raw secrets into client components
  const clientPolicy = {
    ...policy,
    stripe_secret_key: null,
    stripe_publishable_key: null,
    stripe_webhook_secret: null,
    ai_api_key: null,
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted text-sm mt-1">
          {t("description")}
        </p>
      </div>

      <div className="space-y-6">
        <BusinessSettingsForm policy={clientPolicy} />
        <PolicySettings policy={clientPolicy} defaultOpen />
        <BillingSettingsForm policy={clientPolicy} />
      </div>
    </div>
  );
}
