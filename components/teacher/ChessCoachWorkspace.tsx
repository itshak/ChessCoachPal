"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type Workplace = { id: string; name: string; timezone: string; currency: string };
type Student = { id: string; name: string; level: string | null };
type Group = { id: string; name: string; workplace_id: string };
type Session = {
  id: string; title: string; starts_at: string; duration_minutes: number;
  workplace_id: string; group_id: string | null; student_id: string | null;
  lesson_note: string;
};
type Roster = { student_id: string; students: { name: string } | { name: string }[] };
type Attendance = {
  student_id: string; status: "present" | "absent" | "late" | "excused";
  note: string;
};
type Result<T> = { ok?: boolean; data?: T; error?: { code: string; message?: string } };
type AttendanceStatus = Attendance["status"];

const field = "w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const button = "rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";
const panel = "rounded-xl border border-border bg-surface p-5 space-y-3";
const attendanceStatuses: AttendanceStatus[] = ["present", "absent", "late", "excused"];

async function operation<T>(action: string, values: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/agent/v1", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...values }),
    cache: "no-store",
  });
  const result = (await response.json()) as Result<T>;
  if (!response.ok || !result.ok) {
    throw new Error(result.error?.message ?? result.error?.code ?? "Operation failed");
  }
  return result.data as T;
}

function rosterName(row: Roster) {
  const student = Array.isArray(row.students) ? row.students[0] : row.students;
  return student?.name ?? row.student_id;
}

export function ChessCoachWorkspace() {
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workplaceName, setWorkplaceName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [currency, setCurrency] = useState("ILS");
  const [workplaceId, setWorkplaceId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [mode, setMode] = useState<"group" | "private">("group");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [lessonNote, setLessonNote] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [roster, setRoster] = useState<Roster[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const [w, g, s, l] = await Promise.all([
      operation<Workplace[]>("workplaces.list"),
      operation<Group[]>("groups.list"),
      operation<Student[]>("students.search"),
      operation<Session[]>("sessions.list"),
    ]);
    setWorkplaces(w); setGroups(g); setStudents(s); setSessions(l);
    setWorkplaceId(old => old && w.some(item => item.id === old) ? old : w[0]?.id ?? "");
  }, []);

  useEffect(() => {
    void refresh().catch(e => setError(String(e)));
  }, [refresh]);

  useEffect(() => {
    if (!selectedSessionId) {
      setRoster([]); setAttendance([]);
      return;
    }
    void Promise.all([
      operation<Roster[]>("sessions.participants", { sessionId: selectedSessionId }),
      operation<Attendance[]>("attendance.list", { sessionId: selectedSessionId }),
    ]).then(([people, marks]) => {
      setRoster(people); setAttendance(marks);
    }).catch(e => setError(String(e)));
  }, [selectedSessionId]);

  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await work();
      await refresh();
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }

  async function addWorkplace(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(async () => {
      await operation("workplaces.create", { name: workplaceName.trim(), timezone, currency });
      setWorkplaceName("");
    }, "Workplace created.");
  }

  async function addGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(async () => {
      await operation("groups.create", { name: groupName.trim(), workplaceId });
      setGroupName("");
    }, "Class group created.");
  }

  async function enroll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(() => operation("groups.enroll", { groupId, studentId }), "Student enrolled.");
  }

  async function schedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!start || (mode === "group" ? !groupId : !studentId)) {
      setError("Choose a time and a class group or student."); return;
    }
    // Local datetime input is converted to an explicit UTC instant.
    const startsAt = new Date(start).toISOString();
    await perform(async () => {
      const created = await operation<Session>("sessions.create", {
        workplaceId, groupId: mode === "group" ? groupId : undefined,
        studentId: mode === "private" ? studentId : undefined,
        title: title.trim(), startsAt, durationMinutes,
        lessonNote, requestId: crypto.randomUUID(),
      });
      setSelectedSessionId(created.id);
      setTitle(""); setLessonNote(""); setStart("");
    }, "Lesson session created with a frozen attendance roster.");
  }

  async function record(student: string, status: AttendanceStatus, note: string) {
    await perform(async () => {
      await operation("attendance.record", {
        sessionId: selectedSessionId, studentId: student, status, note,
      });
      setAttendance(await operation<Attendance[]>("attendance.list", { sessionId: selectedSessionId }));
    }, "Attendance saved.");
  }

  const localGroups = groups.filter(g => g.workplace_id === workplaceId);
  const session = sessions.find(s => s.id === selectedSessionId);
  const sessionWorkplace = workplaces.find(w => w.id === session?.workplace_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chess coaching</h1>
        <p className="text-sm text-muted mt-1">
          Manage workplaces, classes, sessions and attendance. These screens use the same
          authenticated commands as the experimental agent API.
        </p>
        <p className="text-sm mt-2">
          <Link href="/students" className="text-primary underline">Add or edit students</Link>
        </p>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-500 p-3 text-sm">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-border p-3 text-sm">{notice}</div>}
      <div className="grid gap-5 md:grid-cols-2">
        <section className={panel}>
          <h2 className="text-lg font-semibold">Workplaces</h2>
          <ul className="text-sm space-y-1">
            {workplaces.map(w => <li key={w.id}>{w.name} · {w.timezone} · {w.currency}</li>)}
          </ul>
          <form onSubmit={addWorkplace} className="space-y-2">
            <label className="block text-sm">New workplace name
              <input className={field} value={workplaceName} maxLength={120}
                onChange={e => setWorkplaceName(e.target.value)} required />
            </label>
            <label className="block text-sm">IANA timezone
              <input className={field} value={timezone} onChange={e => setTimezone(e.target.value)}
                maxLength={80} required />
            </label>
            <label className="block text-sm">Currency (ISO 4217)
              <input className={field} value={currency} maxLength={3}
                onChange={e => setCurrency(e.target.value.toUpperCase())} required pattern="[A-Z]{3}" />
            </label>
            <button className={button} disabled={busy}>Create workplace</button>
          </form>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">Class groups</h2>
          <label className="block text-sm">Workplace
            <select className={field} value={workplaceId} onChange={e => {
              setWorkplaceId(e.target.value); setGroupId("");
            }}>
              {workplaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <ul className="text-sm space-y-1">
            {localGroups.map(g => <li key={g.id}>{g.name}</li>)}
          </ul>
          <form onSubmit={addGroup} className="space-y-2">
            <label className="block text-sm">New group name
              <input className={field} maxLength={120} value={groupName}
                onChange={e => setGroupName(e.target.value)} required />
            </label>
            <button className={button} disabled={busy || !workplaceId}>Create class group</button>
          </form>
          <form onSubmit={enroll} className="space-y-2 pt-3 border-t border-border">
            <h3 className="font-semibold">Enroll a student</h3>
            <label className="block text-sm">Group
              <select className={field} value={groupId} onChange={e => setGroupId(e.target.value)} required>
                <option value="">Select a group</option>
                {localGroups.map(g => <option value={g.id} key={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">Student
              <select className={field} value={studentId} onChange={e => setStudentId(e.target.value)} required>
                <option value="">Select a student</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button className={button} disabled={busy || !localGroups.length}>Enroll student</button>
          </form>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">Schedule a lesson</h2>
          <form className="space-y-2" onSubmit={schedule}>
            <label className="block text-sm">Lesson type
              <select className={field} value={mode} onChange={e => setMode(e.target.value as "group" | "private")}>
                <option value="group">Group</option><option value="private">Private student</option>
              </select>
            </label>
            <label className="block text-sm">Workplace
              <select className={field} value={workplaceId} onChange={e => {
                setWorkplaceId(e.target.value); setGroupId("");
              }} required>
                {workplaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            {mode === "group" ?
              <label className="block text-sm">Class group
                <select className={field} value={groupId} onChange={e => setGroupId(e.target.value)} required>
                  <option value="">Select group</option>
                  {localGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label> :
              <label className="block text-sm">Student
                <select className={field} value={studentId} onChange={e => setStudentId(e.target.value)} required>
                  <option value="">Select student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>}
            <label className="block text-sm">Topic or title
              <input className={field} maxLength={160} value={title}
                onChange={e => setTitle(e.target.value)} required placeholder="King and pawn endgames" />
            </label>
            <label className="block text-sm">Local date and time (your browser timezone)
              <input className={field} type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required />
            </label>
            <label className="block text-sm">Duration (minutes)
              <input className={field} type="number" min={15} max={480} value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))} required />
            </label>
            <label className="block text-sm">Teaching note
              <textarea className={field} value={lessonNote} maxLength={10000}
                onChange={e => setLessonNote(e.target.value)} rows={3}
                placeholder="Practiced pawn opposition and triangulation" />
            </label>
            <button className={button} disabled={busy || !workplaceId}>Create lesson</button>
          </form>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">Session attendance</h2>
          <label className="block text-sm">Lesson
            <select className={field} value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}>
              <option value="">Choose lesson</option>
              {sessions.map(s => <option key={s.id} value={s.id}>
                {new Date(s.starts_at).toLocaleString()} — {s.title}
              </option>)}
            </select>
          </label>
          {session && <p className="text-sm text-muted">
            {sessionWorkplace?.name} · {session.duration_minutes} minutes
            {session.lesson_note && <> · {session.lesson_note}</>}
          </p>}
          {!session && <p className="text-sm text-muted">Choose a session to mark each learner independently.</p>}
          {session && roster.length === 0 &&
            <p className="text-sm text-muted">No participants were enrolled when this session was created.</p>}
          {roster.map(person => {
            const marked = attendance.find(a => a.student_id === person.student_id);
            return <AttendanceRow key={person.student_id}
              name={rosterName(person)} existing={marked} busy={busy}
              onSave={(status, note) => record(person.student_id, status, note)} />;
          })}
        </section>
      </div>
    </div>
  );
}

function AttendanceRow({ name, existing, busy, onSave }: {
  name: string;
  existing?: Attendance;
  busy: boolean;
  onSave: (status: AttendanceStatus, note: string) => void;
}) {
  const [status, setStatus] = useState<AttendanceStatus>(existing?.status ?? "present");
  const [note, setNote] = useState(existing?.note ?? "");
  useEffect(() => {
    setStatus(existing?.status ?? "present");
    setNote(existing?.note ?? "");
  }, [existing?.status, existing?.note]);
  return <div className="rounded-lg border border-border p-3 space-y-2">
    <div className="font-medium">{name}</div>
    <label className="block text-sm">Attendance
      <select className={field} value={status}
        onChange={e => setStatus(e.target.value as AttendanceStatus)}>
        {attendanceStatuses.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
    <label className="block text-sm">Student note
      <input className={field} value={note} maxLength={5000}
        onChange={e => setNote(e.target.value)} />
    </label>
    <button className={button} disabled={busy} onClick={() => onSave(status, note)}>
      {existing ? "Update attendance" : "Record attendance"}
    </button>
  </div>;
}
