import Link from "next/link";
import {getTranslations} from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewEventForm } from "@/components/teacher/events/NewEventForm";

export async function generateMetadata(){const t=await getTranslations("newEventPage");return {title:t("title")};}

function defaultStartsAt(dateParam?: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return `${dateParam}T15:00`;
  }
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const t=await getTranslations("newEventPage");
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{data:students},{data:workplaces}] = await Promise.all([
    supabase.from("students").select("id,name").eq("teacher_id",user.id).order("name"),
    supabase.from("workplaces").select("id,name").eq("teacher_id",user.id).order("name"),
  ]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/events"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span> {t("events")}
        </Link>
        <h1 className="text-2xl font-bold mt-2">{t("title")}</h1>
        <p className="text-muted text-sm mt-1">
          {t("description")}
        </p>
      </div>
      <NewEventForm
        students={students ?? []}
        workplaces={workplaces ?? []}
        initialStartsAt={defaultStartsAt(params.date)}
      />
    </div>
  );
}
