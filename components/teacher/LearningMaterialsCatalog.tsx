"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type MaterialKind="game"|"puzzle"|"drill"|"study_chapter"|"external_link";
type Material={
  id:string;kind:MaterialKind;title:string;description:string;source_url:string|null;
  chess_games:{pgn:string;white_player:string;black_player:string;result:string}|null;
  chess_puzzles:{fen:string;solution:string|null;themes:string[]}|null;
  chess_drills:{instructions:string;mode:string;repetitions:number|null}|null;
  chess_study_chapters:{provider:string;study_id:string;chapter_id:string|null}|null;
};
const field="w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const button="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";
const kinds:MaterialKind[]=["game","puzzle","drill","study_chapter","external_link"];
const labels:Record<MaterialKind,string>={
  game:"Game (PGN)",puzzle:"Puzzle (FEN)",drill:"Drill",
  study_chapter:"Study chapter",external_link:"External link",
};

export function LearningMaterialsCatalog(){
  const [items,setItems]=useState<Material[]>([]);
  const [total,setTotal]=useState(0);
  const [kind,setKind]=useState<MaterialKind>("game");
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [sourceUrl,setSourceUrl]=useState("");
  const [pgn,setPgn]=useState("");
  const [white,setWhite]=useState("");
  const [black,setBlack]=useState("");
  const [result,setResult]=useState<"1-0"|"0-1"|"1/2-1/2"|"*">("*");
  const [fen,setFen]=useState("");
  const [solution,setSolution]=useState("");
  const [themes,setThemes]=useState("");
  const [instructions,setInstructions]=useState("");
  const [mode,setMode]=useState<"calculation"|"repetition"|"endgame"|"opening"|"other">("other");
  const [repetitions,setRepetitions]=useState("");
  const [provider,setProvider]=useState<"lichess"|"other">("lichess");
  const [studyId,setStudyId]=useState("");
  const [chapterId,setChapterId]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState<MaterialKind|"">("");
  const load=useCallback(async()=>{
    const params=new URLSearchParams({limit:"100"});
    if(filter)params.set("kind",filter);
    if(search.trim())params.set("query",search.trim());
    const response=await fetch("/api/training/materials?"+params,{cache:"no-store"});
    if(!response.ok)throw new Error("Unable to load the learning materials");
    const data=await response.json() as {materials:Material[];total:number};
    setItems(data.materials);setTotal(data.total);
  },[filter,search]);
  useEffect(()=>{let active=true;
    void load().catch(()=>{if(active)setError("Unable to load materials");});
    return()=>{active=false};
  },[load]);
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");setStatus("");
    const details:Record<string,unknown>=kind==="game"
      ?{pgn,whitePlayer:white,blackPlayer:black,result}
      :kind==="puzzle"?{fen,solution:solution||null,themes:themes.split(",").map(x=>x.trim()).filter(Boolean)}
      :kind==="drill"?{instructions,mode,repetitions:repetitions?Number(repetitions):null}
      :kind==="study_chapter"?{provider,studyId,chapterId:chapterId||null}
      :{};
    const payload={
      kind,title:title.trim(),description,sourceUrl:sourceUrl.trim()||null,details,
      requestId:crypto.randomUUID(),
    };
    try {
      const response=await fetch("/api/training/materials",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Unable to create material");
      setStatus("Material saved to the reusable learning library.");
      setTitle("");setDescription("");setPgn("");setFen("");setInstructions("");
      setSourceUrl("");setStudyId("");setChapterId("");setThemes("");setSolution("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to save material");}
    finally{setBusy(false);}
  }
  return <section className="space-y-4" aria-label="Typed learning materials catalog">
    <div>
      <h2 className="text-2xl font-semibold">Learning materials library</h2>
      <p className="text-sm text-muted">Games, puzzles, drills and study chapters have separate chess-specific records in one searchable catalog. Saving a resource does not mark it as taught or mastered.</p>
    </div>
    <form onSubmit={create} className="rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-lg font-semibold">Add chess material</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Material type
          <select className={field} value={kind} onChange={e=>setKind(e.target.value as MaterialKind)}>
            {kinds.map(k=><option key={k} value={k}>{labels[k]}</option>)}
          </select>
        </label>
        <label className="text-sm">Title
          <input className={field} value={title} maxLength={160} required onChange={e=>setTitle(e.target.value)}/>
        </label>
      </div>
      <label className="block text-sm">Description (optional)
        <textarea className={field} rows={2} maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)}/>
      </label>
      <label className="block text-sm">HTTPS source URL {kind==="study_chapter"||kind==="external_link"?"(required)":"(optional)"}
        <input className={field} type="url" value={sourceUrl} required={kind==="study_chapter"||kind==="external_link"} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://lichess.org/study/..."/>
      </label>
      {kind==="game"&&<div className="space-y-2">
        <label className="block text-sm">Game PGN
          <textarea className={field} rows={5} value={pgn} required onChange={e=>setPgn(e.target.value)} placeholder={"1. e4 e5 2. Nf3 Nc6 *"}/>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">White<input className={field} value={white} maxLength={120} onChange={e=>setWhite(e.target.value)}/></label>
          <label className="text-sm">Black<input className={field} value={black} maxLength={120} onChange={e=>setBlack(e.target.value)}/></label>
          <label className="text-sm">Result
            <select className={field} value={result} onChange={e=>setResult(e.target.value as typeof result)}>
              {["*","1-0","0-1","1/2-1/2"].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted">PGN is stored as supplied; move legality and analysis are not engine-verified in this version.</p>
      </div>}
      {kind==="puzzle"&&<div className="space-y-2">
        <label className="block text-sm">Puzzle FEN (all six fields)
          <input className={field} value={fen} required onChange={e=>setFen(e.target.value)} placeholder="... w KQkq - 0 1"/>
        </label>
        <label className="block text-sm">Solution (optional/unverified)
          <textarea className={field} rows={2} value={solution} onChange={e=>setSolution(e.target.value)}/>
        </label>
        <label className="block text-sm">Themes, separated by commas
          <input className={field} value={themes} onChange={e=>setThemes(e.target.value)} placeholder="fork, endgame"/>
        </label>
      </div>}
      {kind==="drill"&&<div className="space-y-2">
        <label className="block text-sm">Drill instructions
          <textarea className={field} rows={3} required value={instructions} onChange={e=>setInstructions(e.target.value)}/>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Mode
            <select className={field} value={mode} onChange={e=>setMode(e.target.value as typeof mode)}>
              {["other","calculation","repetition","endgame","opening"].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="text-sm">Repetitions (optional)
            <input className={field} type="number" min={1} max={10000} value={repetitions} onChange={e=>setRepetitions(e.target.value)}/>
          </label>
        </div>
      </div>}
      {kind==="study_chapter"&&<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-sm">Provider
          <select className={field} value={provider} onChange={e=>setProvider(e.target.value as typeof provider)}>
            <option value="lichess">Lichess</option><option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm">Study ID
          <input className={field} maxLength={128} value={studyId} required onChange={e=>setStudyId(e.target.value)}/>
        </label>
        <label className="text-sm">Chapter ID (optional)
          <input className={field} maxLength={128} value={chapterId} onChange={e=>setChapterId(e.target.value)}/>
        </label>
      </div>}
      <button className={button} type="submit" disabled={busy}>{busy?"Saving…":"Save material"}</button>
      {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
      {status&&<p role="status" className="text-sm text-emerald-600">{status}</p>}
    </form>
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <input className={field+" sm:max-w-xs"} aria-label="Search learning materials" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by title"/>
        <select className={field+" sm:max-w-xs"} aria-label="Filter material type" value={filter} onChange={e=>setFilter(e.target.value as MaterialKind|"")}>
          <option value="">All types</option>{kinds.map(k=><option key={k} value={k}>{labels[k]}</option>)}
        </select>
      </div>
      <p className="text-sm text-muted">Showing {items.length} of {total} stored materials</p>
      {items.map(material=><div key={material.id} className="rounded-lg border border-border p-3 space-y-1">
        <strong className="text-sm">{material.title}</strong>
        <span className="ml-2 text-xs text-muted">{labels[material.kind]}</span>
        {material.description&&<p className="text-sm">{material.description}</p>}
        {material.chess_games&&<p className="text-xs text-muted">{material.chess_games.white_player} – {material.chess_games.black_player} ({material.chess_games.result})</p>}
        {material.chess_puzzles&&<p className="text-xs font-mono break-all">FEN: {material.chess_puzzles.fen}</p>}
        {material.chess_drills&&<p className="text-sm">{material.chess_drills.instructions}</p>}
        {material.chess_study_chapters&&<p className="text-xs text-muted">Study {material.chess_study_chapters.study_id}, chapter {material.chess_study_chapters.chapter_id||"not specified"}</p>}
        {material.source_url&&<a className="text-sm underline" href={material.source_url} target="_blank" rel="noopener noreferrer">Open original source</a>}
      </div>)}
    </div>
  </section>;
}
