import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: students },
    { data: workplaces },
    { data: groups },
    { data: upcoming },
    { data: recent },
    { data: teacher },
  ] = await Promise.all([
    supabase.from("students").select("id, name, level, archived_at")
      .eq("teacher_id", user.id).order("name"),
    supabase.from("workplaces").select("id, name").eq("teacher_id", user.id),
    supabase.from("class_groups").select("id, name").eq("teacher_id", user.id),
    supabase.from("teaching_sessions")
      .select("id, title, starts_at, duration_minutes")
      .eq("teacher_id", user.id).gte("starts_at", new Date().toISOString())
      .order("starts_at").limit(6),
    supabase.from("teaching_sessions")
      .select("id, title, starts_at, duration_minutes")
      .eq("teacher_id", user.id).lt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: false }).limit(5),
    supabase.from("teachers").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  const activeStudents = (students ?? []).filter(s => !s.archived_at);
  const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(iso));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {teacher?.display_name ? `Welcome, ${teacher.display_name}` : "Chess coaching dashboard"}
          </h1>
          <p className="text-sm text-muted mt-1">
            Your students, workplaces and upcoming coaching sessions in one place.
          </p>
        </div>
        <Link href="/coaching" className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-semibold text-sm hover:bg-primary-dark">
          Open coaching workspace
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <Card padding="sm">
          <div className="text-sm text-muted">Active students</div>
          <div className="text-3xl font-bold mt-1">{activeStudents.length}</div>
          <Link href="/students" className="text-sm text-primary hover:underline">Manage students</Link>
        </Card>
        <Card padding="sm">
          <div className="text-sm text-muted">Workplaces</div>
          <div className="text-3xl font-bold mt-1">{workplaces?.length ?? 0}</div>
          <Link href="/coaching" className="text-sm text-primary hover:underline">Manage workplaces</Link>
        </Card>
        <Card padding="sm">
          <div className="text-sm text-muted">Class groups</div>
          <div className="text-3xl font-bold mt-1">{groups?.length ?? 0}</div>
          <Link href="/coaching" className="text-sm text-primary hover:underline">View classes</Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <section>
          <h2 className="text-lg font-semibold mb-3">Upcoming coaching sessions</h2>
          {!upcoming?.length ? (
            <Card><p className="text-sm text-muted">No upcoming sessions yet. Create one in Coaching.</p></Card>
          ) : (
            <div className="space-y-2">
              {upcoming.map(session => (
                <Card key={session.id} padding="sm">
                  <p className="font-medium break-words">{session.title}</p>
                  <p className="text-sm text-muted">{dateLabel(session.starts_at)} · {session.duration_minutes} min</p>
                </Card>
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3">Recent coaching sessions</h2>
          {!recent?.length ? (
            <Card><p className="text-sm text-muted">Completed sessions will appear here.</p></Card>
          ) : (
            <div className="space-y-2">
              {recent.map(session => (
                <Card key={session.id} padding="sm">
                  <p className="font-medium break-words">{session.title}</p>
                  <p className="text-sm text-muted">{dateLabel(session.starts_at)}</p>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold">Students</h2>
          <Link href="/students" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {!activeStudents.length ? (
          <Card><p className="text-sm text-muted">Add your first student to start coaching.</p></Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeStudents.slice(0, 9).map(student => (
              <Card key={student.id} padding="sm">
                <Link href={`/students/${student.id}`} className="font-semibold text-primary hover:underline break-words">{student.name}</Link>
                {student.level && <p className="text-xs text-muted mt-1">{student.level}</p>}
              </Card>
            ))}
          </div>
        )}
      </section>
      <div className="mt-8">
        <Link href="/learning" className="text-primary hover:underline font-medium">
          Review chess learning observations and selected studies
        </Link>
      </div>
    </div>
  );
}
