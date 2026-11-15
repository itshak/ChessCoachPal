"use client";
import {useState} from "react";
type Board={board:string[][];sideToMove:string;unknownGameState:string[];
 warning:string;continuationMovesVerified:boolean;};
export function FenReviewPanel(){
 const [fen,setFen]=useState("");
 const [pieceToPlace,setPieceToPlace]=useState(".");
 const [source,setSource]=useState<"manual"|"image">("manual");
 const [board,setBoard]=useState<Board|null>(null),[error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 function replaceSquare(rank:number,file:number){
  if(!board)return;
  const next=board.board.map(row=>row.slice());
  next[rank][file]=pieceToPlace==="."?"":pieceToPlace;
  const placement=next.map(row=>{
   let result="",empty=0;
   for(const piece of row){
    if(!piece){empty++;continue;}
    if(empty){result+=String(empty);empty=0;}
    result+=piece;
   }
   if(empty)result+=String(empty);
   return result;
  }).join("/");
  // Never guess active color, castling rights or clocks from a photo.
  const fields=fen.trim().split(/\s+/);
  if(fields.length!==6){setError("Enter six FEN fields before editing.");return;}
  setFen([placement,...fields.slice(1)].join(" "));
  setBoard(null);setError("");
 }
 async function inspect(){
  setBusy(true);setBoard(null);setError("");
  try{
   const res=await fetch("/api/lichess/fen-validate",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({fen,source}),
   });
   const body=await res.json();
   if(!res.ok)throw new Error(body.error??"Invalid FEN");
   setBoard(body as Board);
  }catch(e){setError(e instanceof Error?e.message:"FEN check failed");}
  finally{setBusy(false);}
 }
 return <section aria-label="FEN position validation" className="rounded-xl border border-border bg-surface p-4 space-y-3">
  <h2 className="text-lg font-semibold">Review a chess position before publishing</h2>
  <p className="text-sm text-muted">Checks six FEN fields, piece counts, impossible king/check states, castling and en-passant consistency. GigaChess checks the position and each solution move before publication. Images cannot prove turn, castling or clocks.</p>
  <label className="text-sm block">Reviewed six-field FEN
   <textarea rows={2} className="w-full border rounded-lg bg-background p-2" maxLength={120}
    value={fen} onChange={e=>{setFen(e.target.value);setBoard(null);}} />
  </label>
  <label className="text-sm">FEN source
   <select className="ml-2 border rounded-lg bg-background p-2" value={source}
    onChange={e=>{setSource(e.target.value as "manual"|"image");setBoard(null);}}>
    <option value="manual">Teacher-entered</option><option value="image">Image-derived proposal</option>
   </select>
  </label>
  <button type="button" className="rounded-lg bg-primary px-3 py-2 text-white disabled:opacity-50"
   disabled={busy||fen.trim().length<10} onClick={()=>void inspect()}>
   Validate and review (no provider write)</button>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {board&&<div className="space-y-2 text-sm">
   <label className="block">Square editor — revalidate after every correction
    <select aria-label="Piece to place" className="ml-2 border rounded-lg bg-background p-2"
      value={pieceToPlace} onChange={e=>setPieceToPlace(e.target.value)}>
      <option value=".">Empty square</option>
      {["P","N","B","R","Q","K","p","n","b","r","q","k"].map(piece=>
       <option key={piece} value={piece}>{piece===piece.toUpperCase()?"White":"Black"} {({
        p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king",
       } as Record<string,string>)[piece.toLowerCase()]}</option>)}
    </select>
   </label>
   <div className="grid grid-cols-8 w-fit border border-border">
    {board.board.flatMap((rank,i)=>rank.map((piece,j)=><button key={i+"-"+j} type="button"
      aria-label={"Edit "+String.fromCharCode(97+j)+(8-i)}
      title={"Edit "+String.fromCharCode(97+j)+(8-i)}
      onClick={()=>replaceSquare(i,j)}
      className={"w-9 h-9 flex items-center justify-center "+((i+j)%2?"bg-surface-strong":"bg-background")}>
      {piece||"·"}</button>))}
   </div>
   <p>Side to move (provided): {board.sideToMove}. {board.warning}</p>
   {board.unknownGameState.length>0&&<p>Unverified from photo: {board.unknownGameState.join(", ")}</p>}
  </div>}
 </section>;
}
