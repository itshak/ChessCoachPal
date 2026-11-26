import {createRoot} from "react-dom/client";
import {useEffect,useState} from "react";
import {copy,palettes,sessions,students} from "../../../app/design-lab/fixtures.ts";
import "./style.css";
const loaders={base:()=>import("./base.jsx"),aria:()=>import("./aria.jsx"),ariakit:()=>import("./ariakit.jsx")};
const foundations={base:"Base UI",aria:"React Aria Components",ariakit:"Ariakit"};
const views=["today","students","lesson"];
function App(){
  const [foundation,setFoundation]=useState("base");
  const [loaded,setLoaded]=useState(null);
  const [loadError,setLoadError]=useState("");
  const [palette,setPalette]=useState(0);
  const [theme,setTheme]=useState("dark");
  const [layout,setLayout]=useState("compact");
  const [locale,setLocale]=useState("en");
  const [view,setView]=useState("today");
  const [workplace,setWorkplace]=useState("");
  const [student,setStudent]=useState("s1");
  const [includeArchived,setIncludeArchived]=useState(false);
  const [lesson,setLesson]=useState("l1");
  const [objective,setObjective]=useState(sessions[0].objective);
  const [attendance,setAttendance]=useState([...sessions[0].participants]);
  const [privateNote,setPrivateNote]=useState("");
  const [sharedNote,setSharedNote]=useState("");
  const [receipt,setReceipt]=useState(null);
  const [validation,setValidation]=useState(false);
  const [command,setCommand]=useState(false);
  const t=copy[locale],tone=palettes[palette][theme],direction=locale==="he"?"rtl":"ltr";
  const selected=students.find(s=>s.id===student);
  const session=sessions.find(s=>s.id===lesson);
  const options=students.filter(s=>(includeArchived||!s.archived)&&(!workplace||s.workplace===workplace)).map(s=>({id:s.id,label:s.name+" · "+s.alias}));
  useEffect(()=>{let live=true;loaders[foundation]().then(module=>{if(live)setLoaded({foundation,module});}).catch(error=>{if(live)setLoadError(String(error));});return()=>{live=false;};},[foundation]);
  useEffect(()=>{const el=document.documentElement;el.lang=locale;el.dir=direction;el.style.colorScheme=theme;for(const [key,value] of Object.entries(tone))el.style.setProperty("--"+key,value);},[locale,direction,theme,tone]);
  useEffect(()=>{function key(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setCommand(true);}}window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
  function chooseLesson(id){const s=sessions.find(s=>s.id===id);if(!s)return;setLesson(id);setObjective(s.objective);setAttendance([...s.participants]);setPrivateNote("");setSharedNote("");setReceipt(null);setValidation(false);setView("lesson");}
  function changeFoundation(id){setLoadError("");setFoundation(id);}
  const C=loaded?.foundation===foundation?loaded.module:null;
  return <main data-layout={layout}>
    <header><h1>{t.lab}</h1><p>{t.notice}</p><div className="switches">
      <label>Foundation<select value={foundation} onChange={e=>changeFoundation(e.target.value)}>{Object.entries(foundations).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>{t.palette}<select value={palette} onChange={e=>setPalette(Number(e.target.value))}>{palettes.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}</select></label>
      <label>{t.theme}<select value={theme} onChange={e=>setTheme(e.target.value)}><option value="dark">{t.dark}</option><option value="light">{t.light}</option></select></label>
      <label>{t.layout}<select value={layout} onChange={e=>setLayout(e.target.value)}>{["compact","editorial","hybrid"].map(k=><option key={k} value={k}>{t[k]}</option>)}</select></label>
      <label>{t.language}<select value={locale} onChange={e=>setLocale(e.target.value)}>{["en","he","ru"].map(k=><option key={k}>{k}</option>)}</select></label>
    </div></header>
    {loadError&&<p role="alert">{loadError}</p>}
    {!C?<p role="status">Loading foundation…</p>:<C.Provider key={foundation} direction={direction} locale={locale}>
    <div className="workspace" data-foundation={foundation}>
      <aside className="sidebar"><div className="brand"><img src="./chesscoachpal.svg" alt="" width="40" height="40"/><strong>ChessCoachPal</strong></div>
      <C.Actions label={t.workplace+": "+(workplace||t.all)} items={[{id:"all",label:t.all},{id:"Club",label:"Club"},{id:"Private",label:"Private"}]} onPick={id=>setWorkplace(id==="all"?"":id)}/>
      <nav>{views.map(v=><button key={v} aria-current={v===view?"page":undefined} onClick={()=>setView(v)}>{t[v]}</button>)}</nav><button onClick={()=>setCommand(true)}>{t.commands}</button></aside>
      <section className="content"><h2>{t[view]}</h2>
      {view==="today"&&<><div className="rows">{sessions.filter(s=>!workplace||s.workplace===workplace).map(s=><button className="row" key={s.id} onClick={()=>chooseLesson(s.id)}><time>{s.time}</time><span><strong>{s.title}</strong><small>{s.objective}</small></span><span>{s.workplace}</span></button>)}</div><h3>{t.pending}</h3><p>{t.exceptions}</p></>}
      {view==="students"&&<><C.Check label={t.archived} checked={includeArchived} onChange={setIncludeArchived}/><C.Picker key={workplace+includeArchived} label={t.search} items={options} onPick={setStudent}/><div className="rows">{options.map(o=><button key={o.id} className="row" aria-pressed={o.id===student} onClick={()=>setStudent(o.id)}>{o.label}</button>)}</div><section className="panel"><h3>{t.details}: <bdi>{selected.name}</bdi></h3><p>{t.strength}: {selected.strength}/10 · {t.rating}: {selected.rating}</p><p>{selected.history}</p></section></>}
      {view==="lesson"&&<form noValidate onSubmit={e=>{e.preventDefault();setValidation(true);if(objective.trim())setReceipt({lesson,objective,attendance:[...attendance],privateNote,sharedNote});}}>
        <C.Actions label={t.select+": "+session.title} items={sessions.map(s=>({id:s.id,label:s.time+" "+s.title}))} onPick={chooseLesson}/>
        <C.Objective label={t.objective} value={objective} invalid={validation&&!objective.trim()} error={t.required} onChange={v=>{setObjective(v);setReceipt(null);}}/>
        <fieldset><legend>{t.attendance}</legend>{session.participants.map(id=><C.Check key={id} label={students.find(s=>s.id===id).name+" · "+t.present} checked={attendance.includes(id)} onChange={checked=>{setAttendance(a=>checked?[...new Set([...a,id])]:a.filter(x=>x!==id));setReceipt(null);}}/>)}</fieldset>
        <label>{t.privateNote}<textarea value={privateNote} onChange={e=>{setPrivateNote(e.target.value);setReceipt(null);}}/></label><label>{t.sharedNote}<textarea value={sharedNote} onChange={e=>{setSharedNote(e.target.value);setReceipt(null);}}/></label>
        <button type="submit">{t.save}</button>{receipt&&<p role="status">{t.saved} · {receipt.attendance.length}/{session.participants.length}</p>}
      </form>}
      </section>{layout==="hybrid"&&<aside className="inspector"><h3>{t.details}</h3><p>{selected.name}</p><p>{selected.history}</p><h3>{t.pending}</h3><p>{t.exceptions}</p></aside>}
    </div><C.Modal open={command} onOpenChange={setCommand} label={t.commands}><C.Picker label={t.commands} items={views.map(v=>({id:v,label:t[v]}))} onPick={id=>{setView(id);setCommand(false);}}/>{views.map(v=><button key={v} onClick={()=>{setView(v);setCommand(false);}}>{t[v]}</button>)}</C.Modal></C.Provider>}
  </main>;
}
createRoot(document.getElementById("root")).render(<App/>);
