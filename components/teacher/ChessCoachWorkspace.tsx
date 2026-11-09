"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { workplaceLocalToUtc, utcToWorkplaceLocal } from "@/lib/coaching-time";

type Workplace = { id: string; name: string; timezone: string; currency: string; locale: string; policy: Record<string, unknown> };
type Student = { id: string; name: string; level: string | null };
type Group = { id: string; name: string; workplace_id: string };
type Session = {
  id: string; title: string; starts_at: string; duration_minutes: number;
  workplace_id: string; group_id: string | null; student_id: string | null;
  lesson_note: string; status: "scheduled" | "completed" | "cancelled";
};
type Roster = { student_id: string; students: { name: string } | { name: string }[] };
type Attendance = {
  student_id: string; status: "unmarked" | "present" | "absent" | "late" | "excused";
  note: string;
};
type Result<T> = { ok?: boolean; data?: T; error?: { code: string; message?: string } };
type AttendanceStatus = Exclude<Attendance["status"], "unmarked">;

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
  const [studentSearch, setStudentSearch] = useState("");
  const [activeStudentSearch, setActiveStudentSearch] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workplaceName, setWorkplaceName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [currency, setCurrency] = useState("ILS");
  const [locale, setLocale] = useState("en");
  const [editWorkplaceName, setEditWorkplaceName] = useState("");
  const [editTimezone, setEditTimezone] = useState("UTC");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editLocale, setEditLocale] = useState("en");
  const [editWorkplacePolicy, setEditWorkplacePolicy] = useState("{}");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentLevel, setNewStudentLevel] = useState("");
  const [editStudentId, setEditStudentId] = useState("");
  const [editStudentName, setEditStudentName] = useState("");
  const [editStudentLevel, setEditStudentLevel] = useState("");
  const [workplaceStudentId, setWorkplaceStudentId] = useState("");
  const [enrolledIds, setEnrolledIds] = useState<string[]>([]);
  const [editGroupName, setEditGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<Roster[]>([]);
  const [groupMembersId, setGroupMembersId] = useState("");
  const groupLoadRef = useRef(0);
  const [workplaceId, setWorkplaceId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [mode, setMode] = useState<"group" | "private" | "ad_hoc">("group");
  const [adHocIds,setAdHocIds]=useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [lessonNote, setLessonNote] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [editSessionTitle, setEditSessionTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editDuration, setEditDuration] = useState(60);
  const [editSessionNote, setEditSessionNote] = useState("");
  const [editStatus, setEditStatus] = useState<Session["status"]>("scheduled");
  const requestRef = useRef<{ signature: string; id: string } | null>(null);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [rosterSessionId, setRosterSessionId] = useState("");
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const [w, g, s, l] = await Promise.all([
      operation<Workplace[]>("workplaces.list"),
      operation<Group[]>("groups.list"),
      operation<Student[]>("students.search", { query: activeStudentSearch }),
      operation<Session[]>("sessions.list"),
    ]);
    setWorkplaces(w); setGroups(g); setStudents(s); setSessions(l);
    setWorkplaceId(old => old && w.some(item => item.id === old) ? old : w[0]?.id ?? "");
  }, [activeStudentSearch]);

  useEffect(() => {
    void refresh().catch(e => setError(String(e)));
  }, [refresh]);

  useEffect(() => {
    let active = true;
    setRoster([]);
    setAttendance([]);
    setRosterSessionId("");
    if (selectedSessionId) {
      void Promise.all([
        operation<Roster[]>("sessions.participants", { sessionId: selectedSessionId }),
        operation<Attendance[]>("attendance.list", { sessionId: selectedSessionId }),
      ]).then(([people, marks]) => {
        if (active) {
          setRoster(people);
          setAttendance(marks);
          setRosterSessionId(selectedSessionId);
        }
      }).catch(e => { if (active) setError(String(e)); });
    }
    return () => { active = false; };
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
      await operation("workplaces.create", { name: workplaceName.trim(), timezone, currency, locale });
      setWorkplaceName("");
    }, "Workplace created.");
  }

  async function updateWorkplace(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(async () => {
      let policy: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(editWorkplacePolicy);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Policy must be a JSON object");
        }
        policy = parsed as Record<string, unknown>;
      } catch {
        throw new Error("Workplace policy must be a valid JSON object");
      }
      await operation("workplaces.update", {
        workplaceId, name: editWorkplaceName.trim(), timezone: editTimezone,
        currency: editCurrency, locale: editLocale, policy,
      });
    }, "Workplace saved.");
  }

  async function addStudent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(async () => {
      await operation("students.create", { name: newStudentName.trim(), level: newStudentLevel.trim() || null });
      setNewStudentName(""); setNewStudentLevel("");
    }, "Student created.");
  }

  async function updateStudent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(() => operation("students.update", {
      studentId: editStudentId, name: editStudentName.trim(), level: editStudentLevel.trim() || null,
    }), "Student saved.");
  }

  async function reloadEnrollments(id: string) {
    if (!id) { setEnrolledIds([]); return; }
    const rows = await operation<{ student_id: string }[]>("workplaces.enrollments", { workplaceId: id });
    setEnrolledIds(rows.map(r => r.student_id));
  }

  async function enrollWorkplace(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(async () => {
      await operation("workplaces.enroll", { workplaceId, studentId: workplaceStudentId });
      await reloadEnrollments(workplaceId);
    }, "Student enrolled in workplace.");
  }

  async function removeFromGroup(student: string) {
    await perform(async () => {
      await operation("groups.unenroll", { groupId, studentId: student });
      await reloadGroupMembers(groupId);
    }, "Student removed from group. Existing lesson rosters remain unchanged.");
  }

  async function reloadGroupMembers(id: string) {
    const request = ++groupLoadRef.current;
    setGroupMembers([]);
    setGroupMembersId("");
    if (!id) return;
    const people = await operation<Roster[]>("groups.members", { groupId: id });
    if (request === groupLoadRef.current) {
      setGroupMembers(people);
      setGroupMembersId(id);
    }
  }

  async function updateGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(() => operation("groups.update", {
      groupId, workplaceId, name: editGroupName.trim(),
    }), "Class group saved.");
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
    await perform(async () => {
      await operation("groups.enroll", { groupId, studentId });
      await reloadEnrollments(workplaceId);
      await reloadGroupMembers(groupId);
    }, "Student enrolled.");
  }

  async function schedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!start || (mode === "group" ? !groupId : mode === "private" ? !studentId : adHocIds.length<2)) {
      setError("Choose a time and a class group or student."); return;
    }
    const zone = workplaces.find(w => w.id === workplaceId)?.timezone ?? "UTC";
    let startsAt: string;
    try { startsAt = workplaceLocalToUtc(start, zone); }
    catch (e) { setError(e instanceof Error ? e.message : "Invalid lesson time"); return; }
    const payload = {
      workplaceId, groupId: mode === "group" ? groupId : undefined,
      studentId: mode === "private" ? studentId : undefined,
      studentIds: mode === "ad_hoc" ? [...adHocIds].sort() : undefined,
      title: title.trim(), startsAt, durationMinutes, lessonNote,
    };
    const signature = JSON.stringify(payload);
    if (requestRef.current?.signature !== signature) {
      requestRef.current = { signature, id: crypto.randomUUID() };
    }
    await perform(async () => {
      const created = await operation<Session>(mode==="ad_hoc"?"sessions.createAdHoc":"sessions.create",
        { ...payload, requestId: requestRef.current!.id });
      requestRef.current = null;
      setSelectedSessionId(created.id);
      setTitle(""); setLessonNote(""); setStart(""); setAdHocIds([]);
    }, "Lesson session created with a frozen attendance roster.");
  }

  async function updateSession(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const current = sessions.find(s => s.id === selectedSessionId);
    const zone = workplaces.find(w => w.id === current?.workplace_id)?.timezone ?? "UTC";
    let startsAt: string;
    try { startsAt = workplaceLocalToUtc(editStart, zone); }
    catch (e) { setError(e instanceof Error ? e.message : "Invalid lesson time"); return; }
    await perform(() => operation("sessions.update", {
      sessionId: selectedSessionId, title: editSessionTitle.trim(), startsAt,
      durationMinutes: editDuration, lessonNote: editSessionNote, status: editStatus,
    }), "Session changes saved.");
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
  const localSessions = sessions.filter(s => s.workplace_id === workplaceId);
  const session = localSessions.find(s => s.id === selectedSessionId);
  const activeWorkplace = workplaces.find(w => w.id === workplaceId);
  const sessionWorkplace = workplaces.find(w => w.id === session?.workplace_id);
  const teacherMinutes = localSessions.reduce((sum, item) =>
    sum + (item.status === "cancelled" ? 0 : item.duration_minutes), 0);

  useEffect(() => {
    const w = workplaces.find(item => item.id === workplaceId);
    if (w) {
      setEditWorkplaceName(w.name); setEditTimezone(w.timezone);
      setEditCurrency(w.currency); setEditLocale(w.locale);
      setEditWorkplacePolicy(JSON.stringify(w.policy ?? {}, null, 2));
    }
    void reloadEnrollments(workplaceId).catch(e => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workplaceId, workplaces]);

  useEffect(() => {
    const s = students.find(item => item.id === editStudentId);
    setEditStudentName(s?.name ?? "");
    setEditStudentLevel(s?.level ?? "");
  }, [editStudentId, students]);

  useEffect(() => {
    const g = groups.find(item => item.id === groupId && item.workplace_id === workplaceId);
    setEditGroupName(g?.name ?? "");
    void reloadGroupMembers(g?.id ?? "").catch(e => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, groups, workplaceId]);

  useEffect(() => {
    if (!session) return;
    setEditSessionTitle(session.title); setEditSessionNote(session.lesson_note);
    setEditDuration(session.duration_minutes); setEditStatus(session.status);
    const zone = workplaces.find(w => w.id === session.workplace_id)?.timezone ?? "UTC";
    setEditStart(utcToWorkplaceLocal(session.starts_at, zone));
  }, [session, workplaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chess coaching</h1>
        <p className="text-sm text-muted mt-1">
          Manage workplaces, classes, sessions and attendance. These screens use the same
          authenticated commands as the experimental agent API.
        </p>
        <p className="text-sm mt-2">
          <Link href="/students" className="text-primary underline">Full student records</Link>
        </p>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-500 p-3 text-sm">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-border p-3 text-sm">{notice}</div>}
      <label className="block text-sm max-w-lg">Active workplace
        <select className={field} value={workplaceId} onChange={e => {
          setWorkplaceId(e.target.value); setGroupId(""); setSelectedSessionId("");
        }}>
          {workplaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <p className="text-sm text-muted">Instructor time in this workplace (listed sessions):
        <strong> {teacherMinutes} minutes</strong>. Group attendees do not multiply teacher minutes.
      </p>
      <section className={panel} aria-labelledby="coaching-session-timeline">
        <h2 id="coaching-session-timeline" className="text-lg font-semibold">Session timeline</h2>
        {localSessions.length ? (
          <ol className="space-y-2">
            {localSessions.map(item => (
              <li key={item.id}>
                <button type="button" className="w-full rounded-lg border border-border p-2 text-left text-sm"
                  aria-current={selectedSessionId === item.id ? "true" : undefined}
                  onClick={() => setSelectedSessionId(item.id)}>
                  <time dateTime={item.starts_at}>{new Date(item.starts_at).toLocaleString("en-US", {
                    timeZone: activeWorkplace?.timezone ?? "UTC",
                  })}</time> · {item.title} · {item.status} · {item.duration_minutes} minutes
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted">No sessions in this workplace yet.</p>}
      </section>
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
            <label className="block text-sm">Locale
              <input className={field} value={locale} onChange={e => setLocale(e.target.value)} required />
            </label>
            <button className={button} disabled={busy}>Create workplace</button>
          </form>
          {activeWorkplace && <form onSubmit={updateWorkplace} className="space-y-2 border-t border-border pt-3">
            <h3 className="font-semibold">Edit selected workplace</h3>
            <label className="block text-sm">Edit workplace name
              <input className={field} value={editWorkplaceName} onChange={e => setEditWorkplaceName(e.target.value)} required maxLength={120} />
            </label>
            <label className="block text-sm">Edit workplace timezone
              <input className={field} value={editTimezone} onChange={e => setEditTimezone(e.target.value)} required />
            </label>
            <label className="block text-sm">Edit workplace currency
              <input className={field} value={editCurrency} onChange={e => setEditCurrency(e.target.value.toUpperCase())} maxLength={3} required pattern="[A-Z]{3}" />
            </label>
            <label className="block text-sm">Edit workplace locale
              <input className={field} value={editLocale} onChange={e => setEditLocale(e.target.value)} required />
            </label>
            <label className="block text-sm">Workplace policy (JSON)
              <textarea className={field} rows={4} value={editWorkplacePolicy}
                onChange={e => setEditWorkplacePolicy(e.target.value)} spellCheck={false} />
            </label>
            <button className={button} disabled={busy}>Save workplace</button>
          </form>}
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">Students</h2>
          <form className="space-y-2" onSubmit={e => {
            e.preventDefault();
            setActiveStudentSearch(studentSearch.trim());
          }}>
            <label className="block text-sm">Find student by name
              <input className={field} value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)} maxLength={80} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={button} type="submit">Search students</button>
              <button className="rounded-lg border border-border px-4 py-2" type="button"
                onClick={() => { setStudentSearch(""); setActiveStudentSearch(""); }}>Clear search</button>
            </div>
            {activeStudentSearch && <p className="text-xs text-muted">Filtering student selectors by: {activeStudentSearch}</p>}
          </form>
          <form onSubmit={addStudent} className="space-y-2">
            <label className="block text-sm">New student name
              <input className={field} value={newStudentName} onChange={e => setNewStudentName(e.target.value)} required maxLength={120} />
            </label>
            <label className="block text-sm">New student skill level
              <input className={field} value={newStudentLevel} onChange={e => setNewStudentLevel(e.target.value)} maxLength={120} placeholder="Beginner" />
            </label>
            <button className={button} disabled={busy}>Create student</button>
          </form>
          <form onSubmit={updateStudent} className="space-y-2 border-t border-border pt-3">
            <label className="block text-sm">Student to edit
              <select className={field} value={editStudentId} onChange={e => setEditStudentId(e.target.value)} required>
                <option value="">Choose student</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">Edit student name
              <input className={field} value={editStudentName} onChange={e => setEditStudentName(e.target.value)} required />
            </label>
            <label className="block text-sm">Edit student skill level
              <input className={field} value={editStudentLevel} onChange={e => setEditStudentLevel(e.target.value)} maxLength={120} />
            </label>
            <button className={button} disabled={busy || !editStudentId}>Save student</button>
          </form>
          <form onSubmit={enrollWorkplace} className="space-y-2 border-t border-border pt-3">
            <h3 className="font-semibold">Enroll student in selected workplace</h3>
            <label className="block text-sm">Student for workplace
              <select className={field} value={workplaceStudentId} onChange={e => setWorkplaceStudentId(e.target.value)} required>
                <option value="">Choose student</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button className={button} disabled={busy || !workplaceId}>Enroll in workplace</button>
          </form>
          <p className="text-sm text-muted">{enrolledIds.length} enrolled in selected workplace.</p>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">Class groups</h2>
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
          <form onSubmit={updateGroup} className="space-y-2 border-t border-border pt-3">
            <label className="block text-sm">Group to edit
              <select className={field} value={groupId} onChange={e => setGroupId(e.target.value)} required>
                <option value="">Choose group</option>
                {localGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">Edit group name
              <input className={field} value={editGroupName} onChange={e => setEditGroupName(e.target.value)} required />
            </label>
            <button className={button} disabled={busy || !groupId}>Save group</button>
          </form>
          <form onSubmit={enroll} className="space-y-2 pt-3 border-t border-border">
            <h3 className="font-semibold">Enroll a student</h3>
            <label className="block text-sm">Group to enroll
              <select className={field} value={groupId} onChange={e => setGroupId(e.target.value)} required>
                <option value="">Select a group</option>
                {localGroups.map(g => <option value={g.id} key={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">Student to enroll
              <select className={field} value={studentId} onChange={e => setStudentId(e.target.value)} required>
                <option value="">Select a student</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button className={button} disabled={busy || !localGroups.length}>Enroll student</button>
          </form>
          {groupId && <div className="border-t border-border pt-3 text-sm">
            <h3 className="font-semibold">Current group register</h3>
            {groupMembersId !== groupId && <p>Loading group register...</p>}
            <ul className="space-y-2">{(groupMembersId === groupId ? groupMembers : []).map(m => <li key={m.student_id} className="flex flex-wrap items-center justify-between gap-2"><span>{rosterName(m)}</span><button type="button" className="rounded border border-border px-2 py-1 text-sm" disabled={busy} onClick={() => void removeFromGroup(m.student_id)} aria-label={`Remove ${rosterName(m)} from group`}>Remove</button></li>)}</ul>
            {groupMembersId === groupId && !groupMembers.length && <p>No students yet.</p>}
          </div>}
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">Schedule a lesson</h2>
          <form className="space-y-2" onSubmit={schedule}>
            <label className="block text-sm">Lesson type
              <select className={field} value={mode} onChange={e => setMode(e.target.value as "group" | "private" | "ad_hoc")}>
                <option value="group">Group</option><option value="private">Private student</option>
                <option value="ad_hoc">Ad-hoc multi-student</option>
              </select>
            </label>
            {mode === "group" ?
              <label className="block text-sm">Session group
                <select className={field} value={groupId} onChange={e => setGroupId(e.target.value)} required>
                  <option value="">Select group</option>
                  {localGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label> : mode==="ad_hoc" ?
              <fieldset className="space-y-1 rounded-lg border border-border p-3">
                <legend className="text-sm font-medium">Choose 2–50 students from this workplace</legend>
                {students.filter(st=>enrolledIds.includes(st.id)).map(st=><label key={st.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={adHocIds.includes(st.id)}
                    onChange={e=>setAdHocIds(old=>e.target.checked ?
                      [...new Set([...old,st.id])].slice(0,50) : old.filter(id=>id!==st.id))} />
                  {st.name}
                </label>)}
                <p className="text-xs text-muted">{adHocIds.length} selected. Attendance is frozen at creation.</p>
              </fieldset> :
              <label className="block text-sm">Private student
                <select className={field} value={studentId} onChange={e => setStudentId(e.target.value)} required>
                  <option value="">Select student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>}
            <label className="block text-sm">Topic or title
              <input className={field} maxLength={160} value={title}
                onChange={e => setTitle(e.target.value)} required placeholder="King and pawn endgames" />
            </label>
            <label className="block text-sm">Local date and time (selected workplace timezone)
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
            <p className="text-xs text-muted">Local time in {activeWorkplace?.timezone ?? "UTC"}; invalid or ambiguous DST times are rejected.</p>
          </form>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">Session attendance</h2>
          <label className="block text-sm">Lesson
            <select className={field} value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}>
              <option value="">Choose lesson</option>
              {localSessions.map(s => <option key={s.id} value={s.id}>
                {new Date(s.starts_at).toLocaleString("en-US", { timeZone: activeWorkplace?.timezone ?? "UTC" })} — {s.title} ({s.status})
              </option>)}
            </select>
          </label>
          {session && <p className="text-sm text-muted">
            {sessionWorkplace?.name} · {session.duration_minutes} minutes
            {session.lesson_note && <> · {session.lesson_note}</>}
          </p>}
          {!session && <p className="text-sm text-muted">Choose a session to mark each learner independently.</p>}
          {session && <form onSubmit={updateSession} className="space-y-2 border-y border-border py-3">
            <h3 className="font-semibold">Edit session or cancel</h3>
            <label className="block text-sm">Edit session title
              <input className={field} value={editSessionTitle} onChange={e => setEditSessionTitle(e.target.value)} required maxLength={160} />
            </label>
            <label className="block text-sm">Reschedule local time
              <input className={field} type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)} required />
            </label>
            <label className="block text-sm">Edit session duration
              <input className={field} type="number" min={15} max={480} value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} required />
            </label>
            <label className="block text-sm">Shared session note
              <textarea className={field} value={editSessionNote} onChange={e => setEditSessionNote(e.target.value)} maxLength={10000} rows={3} />
            </label>
            <label className="block text-sm">Session status
              <select className={field} value={editStatus} onChange={e => setEditStatus(e.target.value as Session["status"])}>
                <option value="scheduled">Scheduled</option><option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <button className={button} disabled={busy}>Save session changes</button>
          </form>}
          {session && roster.length === 0 &&
            <p className="text-sm text-muted">No participants were enrolled when this session was created.</p>}
          {session && rosterSessionId === selectedSessionId && roster.map(person => {
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
  const [status, setStatus] = useState<AttendanceStatus>(existing?.status && existing.status !== "unmarked" ? existing.status : "present");
  const [note, setNote] = useState(existing?.note ?? "");
  useEffect(() => {
    setStatus(existing?.status && existing.status !== "unmarked" ? existing.status : "present");
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
      {existing && existing.status !== "unmarked" ? "Update attendance" : "Record attendance"}
    </button>
  </div>;
}
