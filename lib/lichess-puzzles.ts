import {createHash} from "node:crypto";
import {z} from "zod";

export const puzzleDraftSchema=z.object({
 studyId:z.string().regex(/^[A-Za-z0-9]{8}$/),
 chapterName:z.string().trim().min(1).max(100),
 fen:z.string().trim().min(10).max(120),
 moves:z.string().trim().min(1).max(2500),
 orientation:z.enum(["white","black"]).optional(),
}).strict();
export const puzzlePublishSchema=puzzleDraftSchema.extend({
 expectedSha256:z.string().regex(/^[a-f0-9]{64}$/),
 idempotencyKey:z.string().uuid(),
 confirmed:z.literal(true),
 confirmedExternal:z.literal(true),
}).strict();

export class PuzzleReviewError extends Error {
  constructor(public code:string,message:string){super(message);}
}
export type PuzzleDraft={
  studyId:string;chapterName:string;fen:string;moves:string;
  orientation?:"white"|"black";
};
export type PuzzlePreview={
  studyId:string;chapterName:string;fen:string;moves:string;
  orientation:"white"|"black";pgn:string;sha256:string;
  board:string[][];sideToMove:"white"|"black";
};
const invalid=(message:string):never=>{throw new PuzzleReviewError("VALIDATION_ERROR",message);};
const idPattern=/^[A-Za-z0-9]{8}$/;

export function fenBoard(fen:string){
  const parts=fen.trim().split(/\s+/);
  if(parts.length!==6)invalid("FEN must have six fields");
  const [placement,turn,castling,ep,halfmove,fullmove]=parts;
  const ranks=placement.split("/");
  if(ranks.length!==8)invalid("FEN must have eight ranks");
  const board:string[][]=[];
  let whiteKing=0,blackKing=0;
  for(let index=0;index<8;index++){
    const row:string[]=[];
    for(const ch of ranks[index]){
      if(/^[1-8]$/.test(ch)){
        for(let i=0;i<Number(ch);i++)row.push("");
      }else if(/^[PNBRQKpnbrqk]$/.test(ch)){
        if(ch==="K")whiteKing++;
        if(ch==="k")blackKing++;
        if((index===0||index===7)&&/^[Pp]$/.test(ch))
          invalid("Pawns may not occupy the first or eighth rank");
        row.push(ch);
      }else invalid("FEN contains an invalid piece");
    }
    if(row.length!==8)invalid("Each FEN rank must contain eight squares");
    board.push(row);
  }
  if(whiteKing!==1||blackKing!==1)invalid("FEN requires one king of each color");
  if(turn!=="w"&&turn!=="b")invalid("FEN side to move must be w or b");
  if(castling!=="-"&&(!/^[KQkq]{1,4}$/.test(castling)||
    new Set(castling).size!==castling.length))invalid("Invalid FEN castling rights");
  if(ep!=="-"&&!/^[a-h][36]$/.test(ep))
    invalid("Invalid FEN en-passant square");
  if(!/^(0|[1-9]\d{0,3})$/.test(halfmove)||
     !/^[1-9]\d{0,3}$/.test(fullmove))
    invalid("Invalid FEN move counters");
  return {board,sideToMove:turn==="w"?"white" as const:"black" as const,
    canonical:parts.join(" ")};
}

/** Image-to-position interpretation is a proposal, NEVER a confirmed import.
 * The teacher must inspect the board and moves in this preview before a
 * separate explicitly-approved provider action can create a Lichess chapter.
 */
export function buildPuzzlePreview(input:PuzzleDraft):PuzzlePreview{
  if(!idPattern.test(input.studyId))invalid("A Lichess study ID has eight letters or digits");
  const chapterName=input.chapterName.trim();
  if(chapterName.length<1||chapterName.length>100||
     /[\x00-\x1f\x7f]/.test(chapterName))
    invalid("Chapter name must be 1–100 characters with no control characters");
  const {board,sideToMove,canonical}=fenBoard(input.fen);
  const moves=input.moves.trim().replace(/\s+/g," ");
  if(moves.length<1||moves.length>2500)
    invalid("Provide reviewed solution moves in short PGN/SAN notation");
  if(!/^[0-9A-Za-z\s.+#?!x=O\-/*]+$/.test(moves)||
     moves.includes(".. ..")||moves.includes("--"))
    invalid("Only reviewed chess SAN moves are allowed; no PGN tags or comments");
  const orientation=input.orientation??sideToMove;
  if(orientation!=="white"&&orientation!=="black")invalid("Invalid board orientation");
  const body=moves.replace(/\s*\*$/,"").trim();
  if(!body)invalid("At least one solution move is required");
  const pgn=[
    '[Event "ChessCoachPal reviewed puzzle"]',
    '[Site "https://lichess.org"]',
    '[Result "*"]',
    '[Variant "Standard"]',
    '[SetUp "1"]',
    `[FEN "${canonical}"]`,
    '[White "Puzzle"]',
    '[Black "Puzzle"]',
    "",
    body+" *",
  ].join("\n");
  const sha256=createHash("sha256").update(JSON.stringify({
    studyId:input.studyId,chapterName,orientation,pgn,
  })).digest("hex");
  return {
    studyId:input.studyId,chapterName,fen:canonical,moves:body,
    orientation,pgn,sha256,board,sideToMove,
  };
}
