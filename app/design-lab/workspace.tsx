"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { copy, findStudents, palettes, sessions, students } from "./fixtures";
import styles from "./workspace.module.css";

type Locale = keyof typeof copy;
type View = "today"|"students"|"lesson";
type Layout = "compact"|"editorial"|"hybrid";
const views: View[] = ["today","students","lesson"];
const brand = "ChessCoachPal";
export function DesignLab() {
  const [locale,setLocale]=useState<Locale>("en");
  const [palette,setPalette]=useState(0);
  const [theme,setTheme]=useState<"dark"|"light">("dark");
  const [layout,setLayout]=useState<Layout>("compact");
  const [dense,setDense]=useState(false);
  const [font,setFont]=useState("inter");
  const [view,setView]=useState<View>("today");
  const [workplace,setWorkplace]=useState("");
  const [query,setQuery]=useState("");
  const [archived,setArchived]=useState(false);
  const [studentId,setStudentId]=useState("s1");
  const [sessionId,setSessionId]=useState("l1");
  const [objective,setObjective]=useState(sessions[0].objective);
  const [attendance,setAttendance]=useState<string[]>([...sessions[0].participants]);
  const [privateNote,setPrivateNote]=useState("");
  const [sharedNote,setSharedNote]=useState("");
  const [saved,setSaved]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const commandInput=useRef<HTMLInputElement>(null);
  const [command,setCommand]=useState("");
  const t=copy[locale];
  const tone=palettes[palette][theme];
  const selected=students.find(s=>s.id===studentId)!;
  const session=sessions.find(s=>s.id===sessionId)!;
  const roster=findStudents(query,archived).filter(s=>!workplace||s.workplace===workplace);
  const vars={"--lab-bg":tone.bg,"--lab-surface":tone.surface,"--lab-fg":tone.fg,"--lab-muted":tone.muted,"--lab-accent":tone.accent,"--lab-border":tone.border,"--lab-pad":dense?"8px":"14px",fontFamily:locale==="he"?"var(--font-hebrew), sans-serif":font==="inter"?"var(--font-inter), sans-serif":"system-ui, sans-serif",colorScheme:theme} as CSSProperties;
  function chooseLesson(id:string) {
    const s=sessions.find(row=>row.id===id);
    if(!s)return;
    setSessionId(id);setObjective(s.objective);setAttendance([...s.participants]);setPrivateNote("");setSharedNote("");setSaved(false);setView("lesson");
  }
  function openCommands() { setCommand("");dialog.current?.showModal();commandInput.current?.focus(); }
  useEffect(()=>{
    function key(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setCommand("");dialog.current?.showModal();commandInput.current?.focus();}}
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  },[]);
  return <main className={styles.lab} style={vars} lang={locale} dir={locale==="he"?"rtl":"ltr"} data-layout={layout}>
    <header className={styles.controls}>
      <div><h1>{t.lab}</h1><p>{t.notice}</p><p>{t.foundation}</p></div>
      <div className={styles.switches}>
        <label>{t.palette}<select value={palette} onChange={e=>setPalette(Number(e.target.value))}>{palettes.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}</select></label>
        <label>{t.theme}<select value={theme} onChange={e=>setTheme(e.target.value as typeof theme)}><option value="dark">{t.dark}</option><option value="light">{t.light}</option></select></label>
        <label>{t.layout}<select value={layout} onChange={e=>setLayout(e.target.value as Layout)}>{(["compact","editorial","hybrid"] as const).map(k=><option key={k} value={k}>{t[k]}</option>)}</select></label>
        <label>{t.density}<select value={dense?"dense":"normal"} onChange={e=>setDense(e.target.value==="dense")}><option value="normal">{t.normal}</option><option value="dense">{t.dense}</option></select></label>
        <label>{t.font}<select value={font} onChange={e=>setFont(e.target.value)}><option value="inter">{t.inter}</option><option value="system">{t.system}</option></select></label>
        <label>{t.language}<select value={locale} onChange={e=>setLocale(e.target.value as Locale)}>{(["en","he","ru"] as const).map(k=><option key={k} value={k}>{k.toUpperCase()}</option>)}</select></label>
      </div>
    </header>
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><Image src="/icon/chesscoachpal.svg" alt="" width={40} height={40}/><strong>{brand}</strong></div>
        <label>{t.workplace}<select value={workplace} onChange={e=>setWorkplace(e.target.value)}><option value="">{t.all}</option>{["Club","Private"].map(w=><option key={w}>{w}</option>)}</select></label>
        <nav className={styles.nav} aria-label={t.lab}>{views.map(v=><button key={v} type="button" aria-current={view===v?"page":undefined} onClick={()=>setView(v)}>{t[v]}</button>)}</nav>
        <button type="button" onClick={openCommands}>{t.commands}</button>
      </aside>
      <section className={styles.content}>
        <h2>{t[view]}</h2>
        {view==="today"&&<><div className={styles.rows}>{sessions.filter(s=>!workplace||s.workplace===workplace).map(s=><button type="button" key={s.id} className={styles.row} onClick={()=>chooseLesson(s.id)}><time>{s.time}</time><span><strong>{s.title}</strong><small>{s.objective}</small></span><span>{s.workplace}</span></button>)}</div><section className={styles.panel}><h3>{t.pending}</h3><p>{t.exceptions}</p></section></>}
        {view==="students"&&<><label>{t.search}<input value={query} onChange={e=>setQuery(e.target.value)} /></label><label className={styles.check}><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>{t.archived}</label><div className={styles.rows}>{roster.map(s=><button type="button" className={styles.row} key={s.id} aria-pressed={s.id===studentId} onClick={()=>setStudentId(s.id)}><bdi>{s.name}</bdi><bdi>{s.alias}</bdi><span>{s.strength}/10 · {s.rating}</span></button>)}{!roster.length&&<p>{t.noResults}</p>}</div><section className={styles.panel}><h3>{t.details}: <bdi>{selected.name}</bdi></h3><p>{t.strength}: {selected.strength}/10 · {t.rating}: {selected.rating}</p><p>{selected.history}</p></section></>}
        {view==="lesson"&&<form className={styles.form} onSubmit={e=>{e.preventDefault();if(objective.trim())setSaved(true);}}>
          <label>{t.select}<select value={sessionId} onChange={e=>chooseLesson(e.target.value)}>{sessions.map(s=><option key={s.id} value={s.id}>{s.time} {s.title}</option>)}</select></label>
          <label>{t.objective}<input required value={objective} onChange={e=>{setObjective(e.target.value);setSaved(false);}} aria-invalid={!objective.trim()} /></label>
          {!objective.trim()&&<p role="alert">{t.required}</p>}
          <fieldset><legend>{t.attendance}</legend>{session.participants.map(id=><label key={id} className={styles.check}><input type="checkbox" checked={attendance.includes(id)} onChange={e=>{setAttendance(a=>e.target.checked?[...a,id]:a.filter(x=>x!==id));setSaved(false);}}/><bdi>{students.find(s=>s.id===id)?.name}</bdi> · {t.present}</label>)}</fieldset>
          <label>{t.privateNote}<textarea value={privateNote} onChange={e=>{setPrivateNote(e.target.value);setSaved(false);}}/></label>
          <label>{t.sharedNote}<textarea value={sharedNote} onChange={e=>{setSharedNote(e.target.value);setSaved(false);}}/></label>
          <div className={styles.actions}><button type="submit" disabled={!objective.trim()}>{t.save}</button><button type="button" onClick={()=>chooseLesson(sessionId)}>{t.reset}</button></div>
          {saved&&<p role="status">{t.saved}</p>}
        </form>}
      </section>
      {layout==="hybrid"&&<aside className={styles.inspector}><h3>{t.details}</h3><strong><bdi>{selected.name}</bdi></strong><p>{selected.history}</p><h3>{t.pending}</h3><p>{t.exceptions}</p></aside>}
    </div>
    <dialog ref={dialog} className={styles.dialog} aria-label={t.commands}><label>{t.commands}<input ref={commandInput} value={command} onChange={e=>setCommand(e.target.value)}/></label>{views.filter(v=>t[v].toLowerCase().includes(command.toLowerCase())).map(v=><button type="button" key={v} onClick={()=>{setView(v);dialog.current?.close();}}>{t[v]}</button>)}<button type="button" onClick={()=>dialog.current?.close()}>{t.close}</button></dialog>
  </main>;
}
