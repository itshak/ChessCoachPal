import {createRoot} from "react-dom/client";
import {useEffect,useState,useRef} from "react";
import {copy,palettes,sessions,students} from "../../../app/design-lab/fixtures.ts";
import "./style.css";
import {BrandMark,BrandStudy,logoOptions,Wordmark,OpticalStudy} from "./brand.jsx";
import {StudentProfile,Followups,Preparation,Inspector,contextWords,studentWorkplaces} from "./coach-context.jsx";
const loaders={base:()=>import("./base.jsx"),aria:()=>import("./aria.jsx"),ariakit:()=>import("./ariakit.jsx"),ark:()=>import("./ark.jsx"),radix:()=>import("./radix.jsx"),headless:()=>import("./headless.jsx")};
const foundations={base:"Base UI",aria:"React Aria Components",ariakit:"Ariakit",ark:"Ark UI",radix:"Radix UI + cmdk",headless:"Headless UI"};
const views=["today","students","lesson"];
function App(){
  const [foundation,setFoundation]=useState("ark");
  const [loaded,setLoaded]=useState(null);
  const [loadError,setLoadError]=useState("");
  const [palette,setPalette]=useState(()=>palettes.findIndex(p=>p.name==="Graphite, Iris & Champagne"));
  const [density,setDensity]=useState("comfortable");
  const [typography,setTypography]=useState("system");
  const drafts=useRef(new Map());
  const [nextAction,setNextAction]=useState("");
  const [logo,setLogo]=useState("mentor");
  const [lightStyle,setLightStyle]=useState("theme");
  const [emphasis,setEmphasis]=useState("iris");
  const [showBrand,setShowBrand]=useState(false);
  const commandTrigger=useRef(null);
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
  const t=copy[locale],rawTone=palettes[palette][theme],tone={...rawTone,secondary:rawTone.secondary||rawTone.accent},direction=locale==="he"?"rtl":"ltr";
  const darkTone={...palettes[palette].dark,secondary:palettes[palette].dark.secondary||palettes[palette].dark.accent};
  const selected=students.find(s=>s.id===student&&(includeArchived||!s.archived)&&(!workplace||studentWorkplaces(s.id).includes(workplace)));
  const session=sessions.find(s=>s.id===lesson);
  const options=students.filter(s=>(includeArchived||!s.archived)&&(!workplace||studentWorkplaces(s.id).includes(workplace))).map(s=>({id:s.id,label:s.name+" · "+s.alias}));
  useEffect(()=>{let live=true;loaders[foundation]().then(module=>{if(live)setLoaded({foundation,module});}).catch(error=>{if(live)setLoadError(String(error));});return()=>{live=false;};},[foundation]);
  useEffect(()=>{const el=document.documentElement;el.lang=locale;el.dir=direction;el.style.colorScheme=theme;for(const [key,value] of Object.entries(tone))el.style.setProperty("--"+key,value);},[locale,direction,theme,rawTone]);
  useEffect(()=>{function key(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setCommand(true);}}window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
  function chooseLesson(id){const s=sessions.find(s=>s.id===id);if(!s)return;if(id!==lesson){drafts.current.set(lesson,{objective,attendance,privateNote,sharedNote,nextAction,receipt});const d=drafts.current.get(id);setLesson(id);setObjective(d?.objective??s.objective);setAttendance(d?.attendance??[...s.participants]);setPrivateNote(d?.privateNote??"");setSharedNote(d?.sharedNote??"");setNextAction(d?.nextAction??"");setReceipt(d?.receipt??null);setValidation(false);}setView("lesson");}
  function chooseStudent(id){setStudent(id);const s=students.find(s=>s.id===id);if(s?.archived)setIncludeArchived(true);setView("students");}
  function changeFoundation(id){setLoadError("");setFoundation(id);}
  const C=loaded?.foundation===foundation?loaded.module:null;
  return <main data-layout={layout} data-density={density} data-typography={typography}>
    <header><h1>{t.lab}</h1><p>{t.notice}</p><p>Selected direction: Ark UI + Graphite, Iris & Champagne. Mentor & pupil and Compact coaching mark use approved same-color pieces: pearl in dark mode and graphite in light mode. Optical framing and layout review remain open.</p><div className="switches">
      <label>Foundation<select value={foundation} onChange={e=>changeFoundation(e.target.value)}>{Object.entries(foundations).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>{t.palette}<select aria-label={t.palette} value={palette} onChange={e=>setPalette(Number(e.target.value))}>{palettes.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}</select></label>
      <div className="swatches" aria-label={palettes[palette].name}>{["bg","surface","fg","accent","secondary"].map(role=><span key={role} title={role+" "+tone[role]} style={{background:tone[role]}} />)}</div><label>{t.theme}<select value={theme} onChange={e=>setTheme(e.target.value)}><option value="dark">{t.dark}</option><option value="light">{t.light}</option></select></label>
      <label>{t.layout}<select value={layout} onChange={e=>setLayout(e.target.value)}>{["compact","editorial","hybrid"].map(k=><option key={k} value={k}>{t[k]}</option>)}</select></label>
      <label>{t.language}<select value={locale} onChange={e=>setLocale(e.target.value)}>{["en","he","ru"].map(k=><option key={k}>{k}</option>)}</select></label>
    <label>{contextWords(locale).typography}<select value={typography} onChange={e=>setTypography(e.target.value)}><option value="system">{contextWords(locale).system}</option><option value="editorial">{contextWords(locale).editorial}</option></select></label><label>Density<select value={density} onChange={e=>setDensity(e.target.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><label>Logo<select aria-label="Logo" value={logo} onChange={e=>setLogo(e.target.value)}>{logoOptions.map(({id,label})=><option key={id} value={id}>{label}</option>)}</select></label><label>Pal color<select aria-label="Pal color" value={emphasis} onChange={e=>setEmphasis(e.target.value)}><option value="iris">Iris</option><option value="champagne">Champagne</option></select></label><label>Light logo<select aria-label="Light logo" value={lightStyle} onChange={e=>setLightStyle(e.target.value)}><option value="theme">Approved — same-color pieces</option><option value="outline">Pearl pieces + outline (study)</option></select></label><button type="button" aria-expanded={showBrand} onClick={()=>setShowBrand(v=>!v)}>Brand comparison</button>
    </div>{showBrand&&<><OpticalStudy tone={tone} mode={theme} darkTone={darkTone} lightStyle={lightStyle} emphasis={emphasis}/><BrandStudy tone={tone} mode={theme} selected={logo} onSelect={setLogo} darkTone={darkTone} lightStyle={lightStyle} emphasis={emphasis}/></>}</header>
    {loadError&&<p role="alert">{loadError}</p>}
    {!C?<p role="status">Loading foundation…</p>:<C.Provider key={foundation} direction={direction} locale={locale}>
    <div className="workspace" data-foundation={foundation}>
      <aside className="sidebar"><div className="brand"><BrandMark tone={tone} mode={theme} variant={logo} darkTone={darkTone} lightStyle={lightStyle}/><Wordmark emphasis={emphasis}/></div>
      <C.Actions label={t.workplace+": "+(workplace||t.all)} items={[{id:"all",label:t.all},{id:"Club",label:"Club"},{id:"Private",label:"Private"}]} onPick={id=>setWorkplace(id==="all"?"":id)}/>
      <nav>{views.map(v=><button key={v} aria-current={v===view?"page":undefined} onClick={()=>setView(v)}>{t[v]}</button>)}</nav><button ref={commandTrigger} className="command-trigger" onClick={()=>setCommand(true)}>{t.commands}<kbd>Ctrl K</kbd></button></aside>
      <section className="content"><div className="workspace-context"><span className="brand-secondary">ChessCoachPal</span> <span aria-hidden="true">/</span> {workplace||t.all}</div><h2>{t[view]}</h2>
      {view==="today"&&<><div className="rows">{sessions.filter(s=>!workplace||s.workplace===workplace).map(s=><button className="row" key={s.id} onClick={()=>chooseLesson(s.id)}><time>{s.time}</time><span><strong>{s.title}</strong><small>{s.objective}</small></span><span>{s.workplace}</span></button>)}</div><h3>{t.pending}</h3><p>{t.exceptions}</p><Followups locale={locale} workplace={workplace} onLesson={chooseLesson} onStudent={chooseStudent}/><section className="material-study"><h3>Teaching materials</h3><p>Rook endgames · Study collection</p></section></>}
      {view==="students"&&<><C.Check label={t.archived} checked={includeArchived} onChange={setIncludeArchived}/><C.Picker key={workplace+includeArchived} label={t.search} items={options} onPick={setStudent}/><div className="rows">{options.map(o=><button key={o.id} className="row" aria-pressed={o.id===student} onClick={()=>setStudent(o.id)}>{o.label}</button>)}</div>{selected?<section className="panel"><h3>{t.details}: <bdi>{selected.name}</bdi></h3><p>{t.strength}: {selected.strength}/10 · {t.rating}: {selected.rating}</p><p>{selected.history}</p><StudentProfile student={selected} t={t} locale={locale}/></section>:<p>{t.noResults}</p>}</>}
      {view==="lesson"&&<form noValidate onSubmit={e=>{e.preventDefault();setValidation(true);if(objective.trim())setReceipt({lesson,objective,attendance:[...attendance],privateNote,sharedNote,nextAction});}}>
        <C.Actions label={t.select+": "+session.title} items={sessions.map(s=>({id:s.id,label:s.time+" "+s.title}))} onPick={chooseLesson}/>
        <Preparation session={session} locale={locale} nextAction={nextAction} onNextAction={v=>{setNextAction(v);setReceipt(null);}}/><C.Objective label={t.objective} value={objective} invalid={validation&&!objective.trim()} error={t.required} onChange={v=>{setObjective(v);setReceipt(null);}}/>
        <fieldset><legend>{t.attendance}</legend>{session.participants.map(id=><C.Check key={id} label={students.find(s=>s.id===id).name+" · "+t.present} checked={attendance.includes(id)} onChange={checked=>{setAttendance(a=>checked?[...new Set([...a,id])]:a.filter(x=>x!==id));setReceipt(null);}}/>)}</fieldset>
        <label>{t.privateNote}<textarea value={privateNote} onChange={e=>{setPrivateNote(e.target.value);setReceipt(null);}}/></label><label>{t.sharedNote}<textarea value={sharedNote} onChange={e=>{setSharedNote(e.target.value);setReceipt(null);}}/></label>
        <button type="submit" className="primary">{t.save}</button>{receipt&&<p role="status">{t.saved} · {receipt.attendance.length}/{session.participants.length}</p>}
      </form>}
      </section>{layout==="hybrid"&&<Inspector view={view} student={selected} session={session} locale={locale} t={t} onStudent={chooseStudent} onLesson={chooseLesson} workplace={workplace}/>}
    </div><C.Modal open={command} onOpenChange={setCommand} label={t.commands} returnFocus={commandTrigger}><C.Picker label={t.commands} items={views.map(v=>({id:v,label:t[v]}))} onPick={id=>{setView(id);setCommand(false);}}/>{views.map(v=><button key={v} onClick={()=>{setView(v);setCommand(false);}}>{t[v]}</button>)}</C.Modal></C.Provider>}
  </main>;
}
createRoot(document.getElementById("root")).render(<App/>);
