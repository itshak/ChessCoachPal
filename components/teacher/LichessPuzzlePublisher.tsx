"use client";

import {useEffect,useState,type FormEvent} from "react";
import {useConfirm} from "@/components/ui/confirm-dialog";

type Preview={
 studyId:string;chapterName:string;fen:string;moves:string;orientation:"white"|"black";
 sideToMove:"white"|"black";board:string[][];pgn:string;sha256:string;
};
type Published={ok:true;replayed:boolean;chapterId:string;chapterUrl:string;chapterName:string};
const pieces:Record<string,string>={
 K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",
 k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟",
};

/**
 * Image-capable assistants may propose a FEN from an uploaded chess picture.
 * A proposal is NOT proof the pieces are correct. The teacher must edit and
 * visually inspect every square before explicitly approving a write to Lichess.
 */
export function LichessPuzzlePublisher(){
 const confirm=useConfirm();
 const [studyId,setStudyId]=useState("");
 const [chapterName,setChapterName]=useState("Reviewed chess puzzle");
 const [fen,setFen]=useState("");
 const [imageFile,setImageFile]=useState<File|null>(null);
 const [localImageUrl,setLocalImageUrl]=useState<string|null>(null);
 const [imageWarning,setImageWarning]=useState("");
 const [moves,setMoves]=useState("");
 const [orientation,setOrientation]=useState<"white"|"black">("white");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [published,setPublished]=useState<Published|null>(null);
 const [requestId,setRequestId]=useState<string|null>(null);
 const [ambiguous,setAmbiguous]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  if(!imageFile){setLocalImageUrl(null);return;}
  const localUrl=URL.createObjectURL(imageFile);
  setLocalImageUrl(localUrl);
  return ()=>URL.revokeObjectURL(localUrl);
 },[imageFile]);
 function invalidate(){
  setPreview(null);setPublished(null);setRequestId(null);setAmbiguous(false);setError("");
 }
 function data(){return {studyId:studyId.trim(),chapterName:chapterName.trim(),
   fen:fen.trim(),moves:moves.trim(),orientation};}
 async function proposeFenFromImage(){
  if(!imageFile)return;
  if(imageFile.size>2*1024*1024||imageFile.size<32||
     !["image/png","image/jpeg","image/webp"].includes(imageFile.type)){
   setError("Choose a PNG, JPEG or WebP chessboard image up to 2 MB");
   return;
  }
  const approved=await confirm({
   title:"Share this chessboard image with external AI?",
   message:"Your configured OpenAI or Anthropic account will receive this image to propose a FEN. The image could include names or other personal information. The proposed position is unverified; you must check all 64 squares, orientation and game-state placeholders before any publication. You can enter FEN manually instead.",
   confirmLabel:"Share image for proposal",
  });
  if(!approved)return;
  setBusy(true);setError("");setImageWarning("");setPreview(null);
  try{
   const imageBase64=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Unable to read chessboard image"));
    reader.onload=()=>{
     const result=reader.result;
     if(typeof result!=="string"||!result.includes(","))
      reject(new Error("Unable to encode chessboard image"));
     else resolve(result.slice(result.indexOf(",")+1));
    };
    reader.readAsDataURL(imageFile);
   });
   const res=await fetch("/api/lichess/puzzles/preview",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({kind:"image",mediaType:imageFile.type,
      imageBase64,confirmedExternal:true}),
   });
   const body=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(body.error??"Could not propose a chess position");
   // A proposal is untrusted input, not an approved board or Lichess action.
   setFen(body.proposedFen);
   setImageWarning(body.warning??"Verify every square and all game-state fields.");
   setRequestId(null);setPublished(null);setAmbiguous(false);
  }catch(e){setError(e instanceof Error?e.message:"Image analysis failed");}
  finally{setBusy(false);}
 }
 async function review(event:FormEvent){
  event.preventDefault();setBusy(true);setError("");setPublished(null);
  try{
   const res=await fetch("/api/lichess/puzzles/preview",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(data()),
   });
   const body=await res.json();
   if(!res.ok)throw new Error(body.error??"Unable to review FEN");
   setPreview(body as Preview);setAmbiguous(false);setRequestId(null);
  }catch(e){setPreview(null);setError(e instanceof Error?e.message:"Invalid FEN");}
  finally{setBusy(false);}
 }
 async function publish(){
  if(!preview)return;
  const approved=await confirm({
   title:"Publish the reviewed chess puzzle?",
   message:`Confirm all 64 squares, side to move, the solution moves and destination study ${preview.studyId}. This will create a public or private chapter according to your Lichess study settings. Do not retry on an ambiguous provider response.`,
   confirmLabel:"Publish to Lichess",variant:"danger",
  });
  if(!approved)return;
  setBusy(true);setError("");
  const key=requestId??crypto.randomUUID();
  setRequestId(key);
  try{
   const res=await fetch("/api/lichess/puzzles",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...data(),expectedSha256:preview.sha256,
     idempotencyKey:key,confirmed:true,confirmedExternal:true}),
   });
   const body=await res.json();
   if(!res.ok){
    if(body.code==="PROVIDER_RECONCILIATION_REQUIRED")setAmbiguous(true);
    throw new Error(body.error??"Publishing not confirmed");
   }
   setPublished(body as Published);
  }catch(e){setError(e instanceof Error?e.message:"Publishing failed");}
  finally{setBusy(false);}
 }
 return <section aria-label="Review a chess image FEN and publish to Lichess"
  className="space-y-4 rounded-xl border border-border bg-surface p-4">
  <h2 className="text-xl font-semibold">Review a position before publishing</h2>
  <p className="text-sm text-muted">
   Ask an image-capable ChatGPT or Claude conversation to propose the FEN from
   your chess photo, then paste it here. Review the actual board and solution.
   Neither a generated FEN nor a preview automatically publishes anything.
  </p>
  <div className="space-y-3 rounded-lg border border-border p-3" aria-label="Optional chessboard image to FEN proposal">
   <p className="text-sm font-semibold">Optional: propose FEN from a board image</p>
   <p className="text-xs text-muted">Select a local PNG, JPEG or WebP (max 2 MB). Nothing is sent when you select it. Sending requires a separate confirmation and a BYO vision-capable AI connection. The output is an unverified draft, never a published chapter.</p>
   <input type="file" accept="image/png,image/jpeg,image/webp"
    aria-label="Chessboard screenshot or photograph"
    onChange={event=>{invalidate();setImageWarning("");
      setImageFile(event.target.files?.[0]??null);}}
    className="block w-full max-w-md text-sm"/>
   {localImageUrl&&<div className="space-y-1">
    <p className="text-xs text-muted">Your original image for comparison</p>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={localImageUrl} alt="Original chessboard image for review"
     className="max-h-72 w-auto max-w-full rounded-md border border-border object-contain"/>
   </div>}
   <button type="button" disabled={!imageFile||busy}
    onClick={()=>void proposeFenFromImage()}
    className="rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">
    {busy?"Analyzing image…":"Confirm and propose FEN from image"}
   </button>
   {imageWarning&&<p role="status" className="text-xs text-muted">{imageWarning}</p>}
  </div>
  <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>void review(e)}>
   <label className="text-sm">Destination Lichess study ID
    <input value={studyId} onChange={e=>{invalidate();setStudyId(e.target.value);}}
     pattern="[a-zA-Z0-9]{8}" minLength={8} maxLength={8} required
     placeholder="Eight-character study ID"
     className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"/>
   </label>
   <label className="text-sm">Chapter name
    <input value={chapterName} onChange={e=>{invalidate();setChapterName(e.target.value);}}
     maxLength={100} required
     className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"/>
   </label>
   <label className="text-sm sm:col-span-2">FEN to review (six fields)
    <textarea value={fen} onChange={e=>{invalidate();setFen(e.target.value);}}
     required rows={2} placeholder="Piece placement, turn, castling, en passant, halfmove, fullmove"
     className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"/>
   </label>
   <label className="text-sm sm:col-span-2">Reviewed solution moves (SAN)
    <textarea value={moves} onChange={e=>{invalidate();setMoves(e.target.value);}}
     required rows={2} placeholder="1. e4 e5 2. Nf3 ..."
     className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"/>
   </label>
   <label className="text-sm">Board orientation
    <select value={orientation} onChange={e=>{invalidate();setOrientation(e.target.value as "white"|"black");}}
     className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
     <option value="white">White at bottom</option>
     <option value="black">Black at bottom</option>
    </select>
   </label>
   <div className="flex items-end">
    <button disabled={busy} type="submit"
     className="rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">
     {busy?"Reviewing…":"Preview and inspect board"}
    </button>
   </div>
  </form>
  {preview&&<div className="space-y-3" aria-label="Reviewed chess position">
   <p className="text-sm font-semibold">Verify every square before publishing</p>
   <div className="grid grid-cols-8 aspect-square w-full max-w-sm overflow-hidden rounded-lg border border-border"
    role="img" aria-label={`FEN board: ${preview.fen}`}>
    {(preview.orientation==="black"?[...preview.board].reverse().map(r=>[...r].reverse()):
      preview.board).flatMap((rank,row)=>rank.map((piece,col)=><div
       key={row+"-"+col} aria-label={piece?`Piece ${piece}`:"Empty square"}
       className={`flex items-center justify-center text-3xl sm:text-4xl ${(row+col)%2===0?
        "bg-background text-foreground":"bg-primary/25 text-foreground"}`}>
       {pieces[piece]??""}
      </div>))}
   </div>
   <p className="text-xs text-muted">Side to move: {preview.sideToMove}. SHA-256 review:
    <code className="ml-1 break-all">{preview.sha256.slice(0,16)}…</code>
   </p>
   <details className="text-xs">
    <summary className="cursor-pointer">Inspect exact PGN to be sent</summary>
    <pre className="mt-2 overflow-x-auto rounded-md border border-border p-2 whitespace-pre-wrap break-all">
     {preview.pgn}
    </pre>
   </details>
   <button type="button" disabled={busy||ambiguous||!!published} onClick={()=>void publish()}
    className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
    {busy?"Publishing…":"Confirm and publish one chapter"}
   </button>
  </div>}
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {ambiguous&&<p role="alert" className="text-sm text-error">
   Provider status needs manual reconciliation. Check your Lichess study before making
   any further attempt. The same reviewed content cannot be silently imported twice.
  </p>}
  {published&&<p role="status" className="text-sm">
   {published.replayed?"Already published:":"Published:"}{" "}
   <a href={published.chapterUrl} target="_blank" rel="noopener noreferrer"
    className="text-primary underline">{published.chapterName}</a>
  </p>}
 </section>;
}
