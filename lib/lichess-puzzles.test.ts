import {describe,it,expect} from "vitest";
import {buildPuzzlePreview,fenBoard} from "@/lib/lichess-puzzles";

const start="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const draft={studyId:"StUd1234",chapterName:"Reviewed e4 puzzle",fen:start,
  moves:"1. e4 e5 2. Nf3 Nc6",orientation:"white" as const};

describe("human-reviewed FEN puzzle preview",()=>{
 it("resolves all 64 board squares and keeps both kings",()=>{
   const parsed=fenBoard(start);
   expect(parsed.board).toHaveLength(8);
   expect(parsed.board.every(row=>row.length===8)).toBe(true);
   expect(parsed.board[0][4]).toBe("k");
   expect(parsed.board[7][4]).toBe("K");
   expect(parsed.sideToMove).toBe("white");
 });
 it("returns stable opaque content digest, not an implicit publishing action",()=>{
   const first=buildPuzzlePreview(draft);
   const retry=buildPuzzlePreview({...draft});
   expect(retry).toEqual(first);
   expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
   expect(first.pgn).toContain('[SetUp "1"]');
   expect(first.pgn).toContain('[FEN "'+start+'"]');
   expect(first.pgn).toContain("1. e4 e5 2. Nf3 Nc6 *");
   expect(first.pgn).not.toContain("Bearer");
   expect(buildPuzzlePreview({...draft,chapterName:"New position"}).sha256)
     .not.toBe(first.sha256);
   expect(buildPuzzlePreview({...draft,moves:"1. d4 d5"}).sha256)
     .not.toBe(first.sha256);
 });
 it.each([
   "8/8/8/8/8/8/8/8 w - - 0 1",
   "8/8/8/8/8/8/7K/7k w - - 0",
   "8/8/8/8/8/8/7K/6kk w - - 0 1",
   "9/8/8/8/8/8/7K/7k w - - 0 1",
   "P7/8/8/8/8/8/7K/7k w - - 0 1",
   "7k/8/8/8/8/8/7K/8 w KK - 0 1",
   "7k/8/8/8/8/8/7K/8 w - a5 0 1",
 ])("rejects malformed or implausible FEN %s",fen=>{
   expect(()=>buildPuzzlePreview({...draft,fen})).toThrow();
 });
 it("blocks injected PGN tags, comments, and control characters",()=>{
   expect(()=>buildPuzzlePreview({...draft,moves:'1. e4\n[FEN "another"]'}))
     .toThrow(/only reviewed chess san/i);
   expect(()=>buildPuzzlePreview({...draft,moves:"1. e4 {unverified puzzle}"}))
     .toThrow(/only reviewed chess san/i);
   expect(()=>buildPuzzlePreview({...draft,chapterName:"Secret\nLink"}))
     .toThrow(/chapter name/i);
 });
});
