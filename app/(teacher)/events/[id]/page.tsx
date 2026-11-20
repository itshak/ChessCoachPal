import {getTranslations} from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventDetailClient } from "@/components/teacher/events/EventDetailClient";
import {teacherEventDetail,TeacherEventError} from "@/lib/server/teacher-events-service";

export async function generateMetadata(){
  const t=await getTranslations("eventPage");
  return {title:t("metadataTitle")};
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const t=await getTranslations("eventPage");

  let result:Awaited<ReturnType<typeof teacherEventDetail>>;
  try{result=await teacherEventDetail(supabase,user.id,id);}
  catch(error){
    if(error instanceof TeacherEventError&&error.status===404)notFound();
    throw error;
  }
  const event=result.event;
  const [{data:allStudents},{data:workplaces}]=await Promise.all([
    supabase.from("students").select("id,name").eq("teacher_id",user.id).order("name"),
    supabase.from("workplaces").select("id,name").eq("teacher_id",user.id).order("name"),
  ]);
  const students=event.students;
  const rsvps=event.rsvps;

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/events"
        className="text-sm text-muted hover:text-foreground transition-colors"
      >
        <span className="inline-block rtl:rotate-180" aria-hidden="true">←</span> {t("back")}
      </Link>
      <div className="mt-4">
        <EventDetailClient
          eventId={event.id}
          title={event.title}
          description={event.description}
          location={event.location}
          startsAt={event.startsAt}
          endsAt={event.endsAt}
          sendReminder={event.sendReminder}
          reminderSentAt={event.reminderSentAt}
          workplaceId={event.workplaceId}
          workplaces={workplaces??[]}
          students={students}
          allStudents={allStudents ?? []}
          rsvps={rsvps}
        />
      </div>
    </div>
  );
}
