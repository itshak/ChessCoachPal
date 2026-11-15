import {Board,parsePgn} from "gigachess";
import {fenBoard} from "@/lib/lichess-puzzles";

/**
 * Validate the mainline AND every alternative variation before a game is
 * persisted in the typed learning-material catalog. All legality, castling,
 * en-passant and check are GigaChess' native rules; no chess.js dependency.
 *
 * This checks whether moves follow from the specified FEN, not whether a
 * player's identity, result or historical source can be independently proven.
 */
export function validGamePgn(pgn:string):boolean{
 if(pgn.length>150000||!pgn.trim())return false;
 const parsed=parsePgn(pgn);
 if(!parsed.ok||!parsed.value.moves.length)return false;
 const headers=parsed.value.headers;
 const variant=headers.get("Variant");
 if(variant&&variant!=="Standard"&&variant!=="Chess")return false;
 const setup=headers.get("SetUp");
 const initialFen=headers.get("FEN");
 if(setup&&setup!=="0"&&setup!=="1")return false;
 if((setup==="1")!==Boolean(initialFen))return false;
 let board:Board;
 try{
  if(initialFen){fenBoard(initialFen);board=Board.fromFen(initialFen);}
  else board=new Board();
 }catch{return false;}
 let totalPlies=0;
 const visit=(moves:typeof parsed.value.moves,state:Board,depth:number):boolean=>{
  if(depth>12)return false;
  for(const entry of moves){
   // Variations attached to a move branch from the position before it.
   const before=state.toFen();
   for(const variation of entry.variations){
    if(!visit(variation.moves,Board.fromFen(before),depth+1))return false;
   }
   if(entry.san==="--"||entry.san==="Z0")return false;
   const move=state.parseSan(entry.san);
   if(move===null)return false;
   state.makeMove(move);
   totalPlies++;
   if(totalPlies>8192)return false;
  }
  return true;
 };
 try{return visit(parsed.value.moves,board,0);}
 catch{return false;}
}
