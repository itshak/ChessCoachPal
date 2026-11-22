import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {resolveRequestLocale} from "@/i18n/server";
import {localeDetails} from "@/i18n/locales";
import { createClient } from "@/lib/supabase/server";
import { AccountSettings } from "@/components/teacher/AccountSettings";
import { AccountMfaSettings } from "@/components/teacher/AccountMfaSettings";
import { LichessConnectionPanel } from "@/components/teacher/LichessConnectionPanel";
import { NotificationSettingsForm } from "@/components/teacher/settings/NotificationSettingsForm";
import { OptionalAiSettingsForm } from "@/components/teacher/settings/OptionalAiSettingsForm";
import { SpreadsheetImportSettings } from "@/components/teacher/settings/SpreadsheetImportSettings";
import {HistoricalAttendanceImportPanel} from "@/components/teacher/settings/HistoricalAttendanceImportPanel";
import {BulkStudentLifecyclePanel} from "@/components/teacher/settings/BulkStudentLifecyclePanel";
import { DataTransferSettings } from "@/components/teacher/settings/DataTransferSettings";
import { TeacherCalendarFeed } from "@/components/teacher/settings/TeacherCalendarFeed";
import { getPolicy } from "@/lib/server/scheduling";
import { isPushConfigured } from "@/lib/server/push";
import { maskSecret } from "@/lib/billing";
import {loadAccountEntitlementSummary} from "@/lib/server/entitlements";

export async function generateMetadata(){
  const t=await getTranslations("account");
  return {title:t("heading")};
}

export default async function AccountPage() {
  const t=await getTranslations("account");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: teacher } = await supabase
    .from("teachers")
    .select(
      "display_name, avatar_url, email, created_at, calendar_token"
    )
    .eq("id", user.id)
    .single();

  const policy = await getPolicy(supabase, user.id);
  const clientPolicy = {
    ...policy,
    stripe_secret_key: null,
    stripe_publishable_key: null,
    stripe_webhook_secret: null,
    ai_api_key: null,
  };

  const tHosted=await getTranslations("hosted");
  const summary=await loadAccountEntitlementSummary(supabase);
  const studentCap=summary.studentCapacity;
  const activeCount=summary.activeStudentCount;
  const planLabel=studentCap.planCode==="pro"?
    tHosted("plans.pro"):tHosted("plans.free");
  const hostingSection=(
    <section className="rounded-xl border border-border p-4 space-y-2">
      <h2 className="font-semibold">{tHosted("plan")}: {planLabel}</h2>
      {studentCap.unlimited?(
        <p className="text-sm text-muted">{tHosted("unlimited")}</p>
      ):(
        <p className="text-sm text-muted">{tHosted("activeStudents",{
          count:activeCount,limit:studentCap.limit??0,
        })}</p>
      )}
    </section>
  );
  const limitBanner=studentCap.unlimited || studentCap.limit===null ||
    activeCount<studentCap.limit?null:(
      <p role="status" className="text-sm text-warning">
        {tHosted("activeStudents",{count:activeCount,limit:studentCap.limit})}
      </p>
    );

  const accountEmail = user.email ?? teacher?.email ?? "";
  const memberSinceLabel = new Date(
    teacher?.created_at ?? user.created_at
  ).toLocaleDateString(localeDetails[await resolveRequestLocale()].intl, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t("heading")}</h1>
      <Link href="/ai-connections" className="underline text-sm">{t("connections")}</Link>

      {limitBanner}

      <div className="space-y-6">
        <AccountSettings
          initialName={teacher?.display_name ?? ""}
          initialAvatarUrl={teacher?.avatar_url ?? null}
          currentEmail={accountEmail}
          memberSinceLabel={memberSinceLabel}
          timezone={policy.timezone}
        >
          {hostingSection}
        </AccountSettings>
        <AccountMfaSettings />

        <div id="lichess-connection">
          <LichessConnectionPanel returnTo="account" />
        </div>

        {teacher?.calendar_token && (
          <TeacherCalendarFeed token={teacher.calendar_token} />
        )}

        <NotificationSettingsForm
          policy={clientPolicy}
          accountEmail={accountEmail}
          pushConfigured={isPushConfigured()}
        />
        <OptionalAiSettingsForm
          policy={clientPolicy}
          aiStatus={{
            configured: Boolean(policy.ai_api_key),
            masked: maskSecret(policy.ai_api_key),
          }}
        />
        <SpreadsheetImportSettings
          aiConfigured={
            policy.ai_provider !== "none" && Boolean(policy.ai_api_key)
          }
        />
        <HistoricalAttendanceImportPanel />
        <BulkStudentLifecyclePanel />
        <DataTransferSettings />
      </div>
    </div>
  );
}
