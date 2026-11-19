"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {LocalizedUiError} from "@/i18n/api-error";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {useTranslations,useLocale} from "next-intl";
import Link from "next/link";
import { workplaceLocalToUtc, utcToWorkplaceLocal } from "@/lib/coaching-time";

type Workplace = { id: string; name: string; timezone: string; currency: string; locale: string; policy: Record<string, unknown>; updated_at:string };
type Student = { id: string; name: string; level: string | null; updated_at:string };
type Group = { id: string; name: string; workplace_id: string; updated_at:string };
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
type RosterPreview = {
  sessionId:string;updatedAt:string;studentIds:string[];
};
type RosterAudit = {
  id:string;createdAt:string;reason:string;
  previousStudentIds:string[];correctedStudentIds:string[];removedAttendanceCount:number;
};
type Result<T> = { ok?: boolean; data?: T; error?: { code: string; message?: string } };
type AttendanceStatus = Exclude<Attendance["status"], "unmarked">;

const field = "w-full min-w-0 max-w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const button = "rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";
const panel = "min-w-0 max-w-full rounded-xl border border-border bg-surface p-5 space-y-3 [overflow-wrap:anywhere]";
const attendanceStatuses: AttendanceStatus[] = ["present", "absent", "late", "excused"];

async function operation<T>(action: string, values: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/agent/v1", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...values }),
    cache: "no-store",
  });
  const result = (await response.json()) as Result<T>;
  if (!response.ok || !result.ok) {
    throw Object.assign(new Error(result.error?.message ?? result.error?.code ?? "Operation failed"),
      {code:result.error?.code});
  }
  return result.data as T;
}

function rosterName(row: Roster) {
  const student = Array.isArray(row.students) ? row.students[0] : row.students;
  return student?.name ?? row.student_id;
}

export function ChessCoachWorkspace({initialWorkplaceId}:{initialWorkplaceId?:string|null}) {
  const t=useTranslations("coaching");
  const lang=useLocale();
  const toUserError=useLocalizedApiError();
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
  const [workplaceId, setWorkplaceId] = useState(initialWorkplaceId??"");
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
  const [rosterCandidates,setRosterCandidates]=useState<Student[]>([]);
  const [rosterEditIds,setRosterEditIds]=useState<string[]>([]);
  const [rosterRevision,setRosterRevision]=useState("");
  const [rosterReason,setRosterReason]=useState("");
  const [rosterSearch,setRosterSearch]=useState("");
  const [rosterConfirmed,setRosterConfirmed]=useState(false);
  const [rosterAudit,setRosterAudit]=useState<RosterAudit[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    // Workplace context must remain usable even if an unrelated roster,
    // student search, or session request fails. Load the selector independently.
    const w = await operation<Workplace[]>("workplaces.list");
    setWorkplaces(w);
    setWorkplaceId(old=>{
      if(initialWorkplaceId&&w.some(item=>item.id===initialWorkplaceId))
        return initialWorkplaceId;
      return old&&w.some(item=>item.id===old)?old:w[0]?.id??"";
    });
    const [g, s, l] = await Promise.allSettled([
      operation<Group[]>("groups.list"),
      operation<Student[]>("students.search", { query: activeStudentSearch }),
      operation<Session[]>("sessions.list"),
    ]);
    if(g.status==="fulfilled")setGroups(g.value);
    if(s.status==="fulfilled")setStudents(s.value);
    if(l.status==="fulfilled")setSessions(l.value);
    const failed=[g,s,l].find(result=>result.status==="rejected");
    if(failed?.status==="rejected")throw failed.reason;
  }, [activeStudentSearch,initialWorkplaceId]);

  useEffect(()=>{
    if(initialWorkplaceId&&workplaces.some(w=>w.id===initialWorkplaceId))
      setWorkplaceId(initialWorkplaceId);
  },[initialWorkplaceId,workplaces]);

  useEffect(() => {
    void refresh().catch(e => setError(toUserError(e,t("operationFailed"))));
  }, [refresh,t,toUserError]);

  useEffect(() => {
    let active = true;
    setRoster([]);
    setAttendance([]);
    setRosterSessionId("");
    setRosterEditIds([]);setRosterRevision("");setRosterReason("");
    setRosterConfirmed(false);setRosterAudit([]);
    if (selectedSessionId) {
      void Promise.all([
        operation<Roster[]>("sessions.participants", { sessionId: selectedSessionId }),
        operation<Attendance[]>("attendance.list", { sessionId: selectedSessionId }),
        fetch("/api/coaching/sessions/"+encodeURIComponent(selectedSessionId)+"/roster",
          {cache:"no-store"}).then(async response=>{
          if(!response.ok)throw new LocalizedUiError(t("rosterReadFailed"));
          return await response.json() as RosterPreview;
        }),
        fetch("/api/students?limit=1000",{cache:"no-store"}).then(async response=>{
          if(!response.ok)throw new LocalizedUiError(t("studentRosterLoadFailed"));
          const result=await response.json() as {students:Student[]};
          return result.students;
        }),
      ]).then(([people,marks,preview,candidates])=>{
        if(active){
          setRoster(people);setAttendance(marks);
          setRosterSessionId(selectedSessionId);
          setRosterEditIds(preview.studentIds);
          setRosterRevision(preview.updatedAt);
          setRosterCandidates(candidates);
        }
      }).catch(e=>{if(active)setError(toUserError(e,t("operationFailed")));});
    }
    return () => { active = false; };
  }, [selectedSessionId,t,toUserError]);

  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await work();
      await refresh();
      setNotice(success);
    } catch (e) {
      setError(toUserError(e,t("operationFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function addWorkplace(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(async () => {
      await operation("workplaces.create", { name: workplaceName.trim(), timezone, currency, locale });
      setWorkplaceName("");
    }, t("workplaceCreated"));
  }

  async function updateWorkplace(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const current=workplaces.find(workplace=>workplace.id===workplaceId);
    if(!current){setError(t("reloadWorkplace"));return;}
    await perform(async () => {
      let policy: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(editWorkplacePolicy);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new LocalizedUiError(t("policyMustBeObject"));
        }
        policy = parsed as Record<string, unknown>;
      } catch {
        throw new LocalizedUiError(t("invalidWorkplacePolicy"));
      }
      await operation("workplaces.update", {
        workplaceId, name: editWorkplaceName.trim(), timezone: editTimezone,
        currency: editCurrency, locale: editLocale, policy,
        expectedUpdatedAt:current.updated_at,idempotencyKey:crypto.randomUUID(),
      });
    }, t("workplaceSaved"));
  }

  async function addStudent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(async () => {
      await operation("students.create", { name: newStudentName.trim(), level: newStudentLevel.trim() || null });
      setNewStudentName(""); setNewStudentLevel("");
    }, t("studentCreated"));
  }

  async function updateStudent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const selected=students.find(student=>student.id===editStudentId);
    if(!selected){setError(t("selectCurrentLearner"));return;}
    await perform(() => operation("students.update", {
      studentId: editStudentId, name: editStudentName.trim(), level: editStudentLevel.trim() || null,
      expectedUpdatedAt:selected.updated_at,idempotencyKey:crypto.randomUUID(),
    }), t("studentSaved"));
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
    }, t("workplaceEnrollmentSaved"));
  }

  async function removeFromGroup(student: string) {
    await perform(async () => {
      await operation("groups.unenroll", { groupId, studentId: student });
      await reloadGroupMembers(groupId);
    }, t("groupStudentRemoved"));
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
    const current=groups.find(group=>group.id===groupId&&group.workplace_id===workplaceId);
    if(!current){setError(t("reloadGroup"));return;}
    await perform(() => operation("groups.update", {
      groupId, workplaceId, name: editGroupName.trim(),
      expectedUpdatedAt:current.updated_at,idempotencyKey:crypto.randomUUID(),
    }), t("groupSaved"));
  }

  async function addGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(async () => {
      await operation("groups.create", { name: groupName.trim(), workplaceId });
      setGroupName("");
    }, t("groupCreated"));
  }

  async function enroll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await perform(async () => {
      await operation("groups.enroll", { groupId, studentId });
      await reloadEnrollments(workplaceId);
      await reloadGroupMembers(groupId);
    }, t("studentEnrolled"));
  }

  async function schedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!start || (mode === "group" ? !groupId : mode === "private" ? !studentId : adHocIds.length<2)) {
      setError(t("chooseLessonRoster")); return;
    }
    const zone = workplaces.find(w => w.id === workplaceId)?.timezone ?? "UTC";
    let startsAt: string;
    try { startsAt = workplaceLocalToUtc(start, zone); }
    catch (e) { setError(toUserError(e,t("invalidLessonTime"))); return; }
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
    }, t("lessonCreatedFrozen"));
  }

  async function updateSession(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const current = sessions.find(s => s.id === selectedSessionId);
    const zone = workplaces.find(w => w.id === current?.workplace_id)?.timezone ?? "UTC";
    let startsAt: string;
    try { startsAt = workplaceLocalToUtc(editStart, zone); }
    catch (e) { setError(toUserError(e,t("invalidLessonTime"))); return; }
    await perform(() => operation("sessions.update", {
      sessionId: selectedSessionId, title: editSessionTitle.trim(), startsAt,
      durationMinutes: editDuration, lessonNote: editSessionNote,
      ...(editStatus==="completed"?{}:{status:editStatus}),
    }), t("sessionChangesSaved"));
  }

  async function correctHistoricalRoster(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!selectedSessionId||!rosterRevision||!rosterConfirmed)return;
    const url="/api/coaching/sessions/"+encodeURIComponent(selectedSessionId)+"/roster";
    await perform(async()=>{
      const response=await fetch(url,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          studentIds:rosterEditIds,expectedUpdatedAt:rosterRevision,
          reason:rosterReason.trim(),idempotencyKey:crypto.randomUUID(),
          confirmed:true,
        }),
      });
      const outcome=await response.json() as {error?:string};
      if(!response.ok)throw new Error(outcome.error??t("rosterCorrectionFailed"));
      const [preview,people,marks]=await Promise.all([
        fetch(url,{cache:"no-store"}).then(async r=>{
          if(!r.ok)throw new LocalizedUiError(t("rosterReloadFailed"));
          return await r.json() as RosterPreview;
        }),
        operation<Roster[]>("sessions.participants",{sessionId:selectedSessionId}),
        operation<Attendance[]>("attendance.list",{sessionId:selectedSessionId}),
      ]);
      setRosterEditIds(preview.studentIds);setRosterRevision(preview.updatedAt);
      setRoster(people);setAttendance(marks);setRosterSessionId(selectedSessionId);
      setRosterReason("");setRosterConfirmed(false);setRosterAudit([]);
    },t("rosterCorrectedAudited"));
  }

  async function loadRosterAudit(){
    if(!selectedSessionId)return;
    setError("");
    try{
      const response=await fetch("/api/coaching/sessions/"+
        encodeURIComponent(selectedSessionId)+"/roster?revisions=true",
        {cache:"no-store"});
      if(!response.ok)throw new LocalizedUiError(t("correctionHistoryFailed"));
      const body=await response.json() as {corrections:RosterAudit[]};
      setRosterAudit(body.corrections);
    }catch(e){setError(toUserError(e,t("correctionHistoryFailed")));}
  }

  async function record(student: string, status: AttendanceStatus, note: string) {
    await perform(async () => {
      await operation("attendance.record", {
        sessionId: selectedSessionId, studentId: student, status, note,
      });
      setAttendance(await operation<Attendance[]>("attendance.list", { sessionId: selectedSessionId }));
    }, t("attendanceSavedNotice"));
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
    void reloadEnrollments(workplaceId).catch(e => setError(toUserError(e,t("operationFailed"))));
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
    void reloadGroupMembers(g?.id ?? "").catch(e => setError(toUserError(e,t("operationFailed"))));
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
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <div>
        <h1 className="text-2xl font-bold">{t("heading")}</h1>
        <p className="text-sm text-muted mt-1">
          {t("workspaceIntro")}
        </p>
        <p className="text-sm mt-2">
          <Link href="/students" className="text-primary underline">{t("fullRecords")}</Link>
        </p>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-500 p-3 text-sm">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-border p-3 text-sm">{notice}</div>}
      <label className="block text-sm max-w-lg">{t("activeWorkplace")}
        <select data-testid="coaching-workplace-select" className={field} value={workplaceId} onChange={e => {
          setWorkplaceId(e.target.value); setGroupId(""); setSelectedSessionId("");
        }}>
          {workplaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <p className="text-sm text-muted">{t("instructorTime",{count:teacherMinutes})}</p>
      <section className={panel} aria-labelledby="coaching-session-timeline">
        <h2 id="coaching-session-timeline" className="text-lg font-semibold">{t("sessionTimeline")}</h2>
        {localSessions.length ? (
          <ol className="space-y-2">
            {localSessions.map(item => (
              <li key={item.id}>
                <button type="button" className="w-full rounded-lg border border-border p-2 text-start text-sm"
                  aria-current={selectedSessionId === item.id ? "true" : undefined}
                  onClick={() => setSelectedSessionId(item.id)}>
                  <time dateTime={item.starts_at}>{new Date(item.starts_at).toLocaleString(lang, {
                    timeZone: activeWorkplace?.timezone ?? "UTC",
                  })}</time> · <bdi dir="auto">{item.title}</bdi> · {t(item.status)} · {t("minuteCount",{count:item.duration_minutes})}
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted">{t("emptySessions")}</p>}
      </section>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className={panel}>
          <h2 className="text-lg font-semibold">{t("workplaces")}</h2>
          <ul className="text-sm space-y-1 [overflow-wrap:anywhere]">
            {workplaces.map(w => <li key={w.id}><bdi dir="auto">{w.name}</bdi> · <span dir="ltr">{w.timezone}</span> · <span dir="ltr">{w.currency}</span></li>)}
          </ul>
          <form onSubmit={addWorkplace} className="space-y-2">
            <label className="block text-sm">{t("newWorkplaceName")}
              <input className={field} value={workplaceName} maxLength={120}
                onChange={e => setWorkplaceName(e.target.value)} required />
            </label>
            <label className="block text-sm">{t("timezone")}
              <input className={field} value={timezone} onChange={e => setTimezone(e.target.value)}
                maxLength={80} required />
            </label>
            <label className="block text-sm">{t("currency")}
              <input className={field} value={currency} maxLength={3}
                onChange={e => setCurrency(e.target.value.toUpperCase())} required pattern="[A-Z]{3}" />
            </label>
            <label className="block text-sm">{t("locale")}
              <input className={field} value={locale} onChange={e => setLocale(e.target.value)} required />
            </label>
            <button className={button} disabled={busy}>{t("createWorkplace")}</button>
          </form>
          {activeWorkplace && <form onSubmit={updateWorkplace} className="space-y-2 border-t border-border pt-3">
            <h3 className="font-semibold">{t("editWorkplace")}</h3>
            <label className="block text-sm">{t("editWorkplaceName")}
              <input className={field} value={editWorkplaceName} onChange={e => setEditWorkplaceName(e.target.value)} required maxLength={120} />
            </label>
            <label className="block text-sm">{t("editWorkplaceTimezone")}
              <input className={field} value={editTimezone} onChange={e => setEditTimezone(e.target.value)} required />
            </label>
            <label className="block text-sm">{t("editWorkplaceCurrency")}
              <input className={field} value={editCurrency} onChange={e => setEditCurrency(e.target.value.toUpperCase())} maxLength={3} required pattern="[A-Z]{3}" />
            </label>
            <label className="block text-sm">{t("editWorkplaceLocale")}
              <input className={field} value={editLocale} onChange={e => setEditLocale(e.target.value)} required />
            </label>
            <label className="block text-sm">{t("workplacePolicy")}
              <textarea className={field} rows={4} value={editWorkplacePolicy}
                onChange={e => setEditWorkplacePolicy(e.target.value)} spellCheck={false} />
            </label>
            <button className={button} disabled={busy}>{t("saveWorkplace")}</button>
          </form>}
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">{t("students")}</h2>
          <form className="space-y-2" onSubmit={e => {
            e.preventDefault();
            setActiveStudentSearch(studentSearch.trim());
          }}>
            <label className="block text-sm">{t("findStudent")}
              <input className={field} value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)} maxLength={80} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={button} type="submit">{t("searchStudents")}</button>
              <button className="rounded-lg border border-border px-4 py-2" type="button"
                onClick={() => { setStudentSearch(""); setActiveStudentSearch(""); }}>{t("clearSearch")}</button>
            </div>
            {activeStudentSearch && <p className="text-xs text-muted">{t("filteringStudents",{query:activeStudentSearch})}</p>}
          </form>
          <form onSubmit={addStudent} className="space-y-2">
            <label className="block text-sm">{t("newStudentName")}
              <input className={field} value={newStudentName} onChange={e => setNewStudentName(e.target.value)} required maxLength={120} />
            </label>
            <label className="block text-sm">{t("newStudentLevel")}
              <input className={field} value={newStudentLevel} onChange={e => setNewStudentLevel(e.target.value)} maxLength={120} placeholder={t("beginner")} />
            </label>
            <button className={button} disabled={busy}>{t("createStudent")}</button>
          </form>
          <form onSubmit={updateStudent} className="space-y-2 border-t border-border pt-3">
            <label className="block text-sm">{t("studentToEdit")}
              <select className={field} value={editStudentId} onChange={e => setEditStudentId(e.target.value)} required>
                <option value="">{t("chooseStudent")}</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">{t("editStudentName")}
              <input className={field} value={editStudentName} onChange={e => setEditStudentName(e.target.value)} required />
            </label>
            <label className="block text-sm">{t("editStudentLevel")}
              <input className={field} value={editStudentLevel} onChange={e => setEditStudentLevel(e.target.value)} maxLength={120} />
            </label>
            <button className={button} disabled={busy || !editStudentId}>{t("saveStudent")}</button>
          </form>
          <form onSubmit={enrollWorkplace} className="space-y-2 border-t border-border pt-3">
            <h3 className="font-semibold">{t("enrollInWorkplace")}</h3>
            <label className="block text-sm">{t("studentForWorkplace")}
              <select className={field} value={workplaceStudentId} onChange={e => setWorkplaceStudentId(e.target.value)} required>
                <option value="">{t("chooseStudent")}</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button className={button} disabled={busy || !workplaceId}>{t("enrollWorkplaceButton")}</button>
          </form>
          <p className="text-sm text-muted">{t("enrolledWorkplace",{count:enrolledIds.length})}</p>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">{t("classGroups")}</h2>
           <ul className="text-sm space-y-1">
            {localGroups.map(g => <li key={g.id}>{g.name}</li>)}
          </ul>
          <form onSubmit={addGroup} className="space-y-2">
            <label className="block text-sm">{t("newGroupName")}
              <input className={field} maxLength={120} value={groupName}
                onChange={e => setGroupName(e.target.value)} required />
            </label>
            <button className={button} disabled={busy || !workplaceId}>{t("createClassGroup")}</button>
          </form>
          <form onSubmit={updateGroup} className="space-y-2 border-t border-border pt-3">
            <label className="block text-sm">{t("groupToEdit")}
              <select className={field} value={groupId} onChange={e => setGroupId(e.target.value)} required>
                <option value="">{t("chooseGroup")}</option>
                {localGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">{t("editGroupName")}
              <input className={field} value={editGroupName} onChange={e => setEditGroupName(e.target.value)} required />
            </label>
            <button className={button} disabled={busy || !groupId}>{t("saveGroup")}</button>
          </form>
          <form onSubmit={enroll} className="space-y-2 pt-3 border-t border-border">
            <h3 className="font-semibold">{t("enrollStudent")}</h3>
            <label className="block text-sm">{t("groupToEnroll")}
              <select className={field} value={groupId} onChange={e => setGroupId(e.target.value)} required>
                <option value="">{t("selectGroup")}</option>
                {localGroups.map(g => <option value={g.id} key={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">{t("studentToEnroll")}
              <select className={field} value={studentId} onChange={e => setStudentId(e.target.value)} required>
                <option value="">{t("selectStudent")}</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button className={button} disabled={busy || !localGroups.length}>{t("enrollButton")}</button>
          </form>
          {groupId && <div className="border-t border-border pt-3 text-sm">
            <h3 className="font-semibold">{t("currentGroupRoster")}</h3>
            {groupMembersId !== groupId && <p>{t("loadingGroupRoster")}</p>}
            <ul className="space-y-2">{(groupMembersId === groupId ? groupMembers : []).map(m => <li key={m.student_id} className="flex flex-wrap items-center justify-between gap-2"><span>{rosterName(m)}</span><button type="button" className="rounded border border-border px-2 py-1 text-sm" disabled={busy} onClick={() => void removeFromGroup(m.student_id)} aria-label={t("removeFromGroup",{name:rosterName(m)})}>{t("remove")}</button></li>)}</ul>
            {groupMembersId === groupId && !groupMembers.length && <p>{t("noStudentsYet")}</p>}
          </div>}
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">{t("scheduleLesson")}</h2>
          <form className="space-y-2" onSubmit={schedule}>
            <label className="block text-sm">{t("lessonType")}
              <select className={field} value={mode} onChange={e => setMode(e.target.value as "group" | "private" | "ad_hoc")}>
                <option value="group">{t("groupOption")}</option><option value="private">{t("privateStudent")}</option>
                <option value="ad_hoc">{t("adhocOption")}</option>
              </select>
            </label>
            {mode === "group" ?
              <label className="block text-sm">{t("sessionGroup")}
                <select className={field} value={groupId} onChange={e => setGroupId(e.target.value)} required>
                  <option value="">{t("selectGroup")}</option>
                  {localGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label> : mode==="ad_hoc" ?
              <fieldset className="space-y-1 rounded-lg border border-border p-3">
                <legend className="text-sm font-medium">{t("chooseMulti")}</legend>
                {students.filter(st=>enrolledIds.includes(st.id)).map(st=><label key={st.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={adHocIds.includes(st.id)}
                    onChange={e=>setAdHocIds(old=>e.target.checked ?
                      [...new Set([...old,st.id])].slice(0,50) : old.filter(id=>id!==st.id))} />
                  {st.name}
                </label>)}
                <p className="text-xs text-muted">{t("adhocSelected",{count:adHocIds.length})}</p>
              </fieldset> :
              <label className="block text-sm">{t("privateStudent")}
                <select className={field} value={studentId} onChange={e => setStudentId(e.target.value)} required>
                  <option value="">{t("selectStudent")}</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>}
            <label className="block text-sm">{t("topicTitle")}
              <input className={field} maxLength={160} value={title}
                onChange={e => setTitle(e.target.value)} required placeholder={t("topicPlaceholder")} />
            </label>
            <label className="block text-sm">{t("localDateTime")}
              <input className={field} type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required />
            </label>
            <label className="block text-sm">{t("duration")}
              <input className={field} type="number" min={15} max={480} value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))} required />
            </label>
            <label className="block text-sm">{t("teachingNote")}
              <textarea className={field} value={lessonNote} maxLength={10000}
                onChange={e => setLessonNote(e.target.value)} rows={3}
                placeholder={t("notePlaceholder")} />
            </label>
            <button className={button} disabled={busy || !workplaceId}>{t("createLesson")}</button>
            <p className="text-xs text-muted">{t("localTimezoneWarning",{zone:activeWorkplace?.timezone ?? "UTC"})}</p>
          </form>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">{t("sessionAttendance")}</h2>
          <label className="block text-sm">{t("lessonOption")}
            <select className={field} value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}>
              <option value="">{t("chooseLesson")}</option>
              {localSessions.map(s => <option key={s.id} value={s.id}>
                {new Date(s.starts_at).toLocaleString(lang, { timeZone: activeWorkplace?.timezone ?? "UTC" })} — {s.title} ({s.status})
              </option>)}
            </select>
          </label>
          {session && <p className="text-sm text-muted">
            <bdi dir="auto">{sessionWorkplace?.name}</bdi> · {t("minuteCount",{count:session.duration_minutes})}
            {session.lesson_note && <> · {session.lesson_note}</>}
          </p>}
          {!session && <p className="text-sm text-muted">{t("selectSessionHint")}</p>}
          {session && <form onSubmit={updateSession} className="space-y-2 border-y border-border py-3">
            <h3 className="font-semibold">{t("editSession")}</h3>
            <label className="block text-sm">{t("editSessionTitle")}
              <input className={field} value={editSessionTitle} onChange={e => setEditSessionTitle(e.target.value)} required maxLength={160} />
            </label>
            <label className="block text-sm">{t("rescheduleLocal")}
              <input className={field} type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)} required />
            </label>
            <label className="block text-sm">{t("editDuration")}
              <input className={field} type="number" min={15} max={480} value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} required />
            </label>
            <label className="block text-sm">{t("sharedNote")}
              <textarea className={field} value={editSessionNote} onChange={e => setEditSessionNote(e.target.value)} maxLength={10000} rows={3} />
            </label>
            <label className="block text-sm">{t("sessionStatus")}
              <select className={field} value={editStatus} onChange={e => setEditStatus(e.target.value as Session["status"])}>
                <option value="scheduled">{t("scheduled")}</option>
                {editStatus==="completed"&&<option value="completed" disabled>{t("completedRecorded")}</option>}
                <option value="cancelled">{t("cancelled")}</option>
              </select>
            </label>
            <p className="text-xs text-muted">{t("finishHint")}</p>
            <button className={button} disabled={busy}>{t("saveSession")}</button>
          </form>}
          {session && rosterRevision && <form onSubmit={correctHistoricalRoster}
            className="space-y-3 border-y border-border py-4">
            <h3 className="font-semibold">{t("correctRoster")}</h3>
            <p className="text-xs text-muted">{t("correctionCaution")}</p>
            <label className="block text-sm">{t("findLearner")}
              <input className={field} value={rosterSearch}
                placeholder={t("searchByName")} onChange={e=>setRosterSearch(e.target.value)}/>
            </label>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border p-2 space-y-1"
              role="group" aria-label={t("rosterAria")}>
              {rosterCandidates.filter(s=>rosterEditIds.includes(s.id)||
                s.name.toLocaleLowerCase().includes(rosterSearch.toLocaleLowerCase()))
                .slice(0,80).map(s=><label key={s.id}
                className="flex items-center gap-2 text-sm px-1 py-1">
                <input type="checkbox" checked={rosterEditIds.includes(s.id)}
                  onChange={e=>setRosterEditIds(current=>e.target.checked
                    ? [...current,s.id] : current.filter(id=>id!==s.id))}/>
                <span>{s.name}</span>
              </label>)}
            </div>
            <p className="text-xs text-muted">{t("rosterSelected",{count:rosterEditIds.length})}</p>
            <label className="block text-sm">{t("reasonCorrection")}
              <textarea className={field} value={rosterReason}
                onChange={e=>setRosterReason(e.target.value)}
                placeholder={t("correctionPlaceholder")}
                minLength={8} maxLength={1000} required rows={2}/>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={rosterConfirmed}
                onChange={e=>setRosterConfirmed(e.target.checked)}/>
              <span>{t("correctionConfirmation")}</span>
            </label>
            <button className={button} disabled={busy||!rosterRevision||
              !rosterConfirmed||rosterReason.trim().length<8||rosterEditIds.length===0}>
              {t("confirmCorrection")}
            </button>
            <div>
              <button type="button" className="text-sm text-primary underline"
                onClick={()=>void loadRosterAudit()}>{t("viewCorrectionHistory")}</button>
              {rosterAudit.map(entry=><p key={entry.id} className="text-xs text-muted mt-1">
                {new Date(entry.createdAt).toLocaleString(lang,{timeZone:timezone})} — {entry.reason}
                {" · "}{entry.previousStudentIds.length} → {entry.correctedStudentIds.length}
                {" · "}{t("removedAttendanceAudited",{count:entry.removedAttendanceCount})}
              </p>)}
            </div>
          </form>}
          {session && roster.length === 0 &&
            <p className="text-sm text-muted">{t("noParticipants")}</p>}
          {session && rosterSessionId === selectedSessionId && roster.map(person => {
            const marked = attendance.find(a => a.student_id === person.student_id);
            return <AttendanceRow key={selectedSessionId+":"+person.student_id+":"+(marked?.status??"")+":"+(marked?.note??"")}
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
  const t=useTranslations("coaching");
  return <div className="rounded-lg border border-border p-3 space-y-2">
    <div className="font-medium">{name}</div>
    <label className="block text-sm">{t("attendance")}
      <select className={field} value={status}
        onChange={e => setStatus(e.target.value as AttendanceStatus)}>
        {attendanceStatuses.map(s => <option key={s} value={s}>{t(s)}</option>)}
      </select>
    </label>
    <label className="block text-sm">{t("studentNote")}
      <input className={field} value={note} maxLength={5000}
        onChange={e => setNote(e.target.value)} />
    </label>
    <button className={button} disabled={busy} onClick={() => onSave(status, note)}>
      {existing && existing.status !== "unmarked" ? t("updateAttendance") : t("recordAttendance")}
    </button>
  </div>;
}
