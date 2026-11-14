import {describe,it,expect} from "vitest";
import {parseLichessPerfs,parseChesscomStats} from "@/lib/chess-public-ratings";
import {nextPuzzleStudyName} from "@/lib/puzzle-study-names";

const now="2026-11-14T18:00:00.000Z";
describe("public chess ratings never infer cross-provider skill",()=>{
 it("keeps Lichess rapid and blitz independent with source and provisional marker",()=>{
  const rows=parseLichessPerfs({perfs:{
   rapid:{rating:2211,rd:50,prov:false,games:300},
   blitz:{rating:1950,rd:101,prov:true,games:3},
   bullet:{rating:"not available",games:0},
  }},now);
  expect(rows).toHaveLength(2);
  expect(rows).toEqual([
   {provider:"lichess",timeControl:"blitz",rating:1950,ratingDeviation:101,
    provisional:true,games:3,source:"provider_api",observedAt:now,fetchedAt:now},
   {provider:"lichess",timeControl:"rapid",rating:2211,ratingDeviation:50,
    provisional:false,games:300,source:"provider_api",observedAt:now,fetchedAt:now},
  ]);
 });
 it("distinguishes Chess.com rapid, daily and puzzles without guessing ratings",()=>{
  const rows=parseChesscomStats({
   chess_rapid:{last:{rating:1822,date:1790000000},record:{win:17,loss:4,draw:7}},
   chess_daily:{last:{rating:1550},record:{win:0,loss:0,draw:0}},
   chess_blitz:{last:{rating:null}},
   tactics:{highest:{rating:1999}},
  },now);
  expect(rows.map(x=>[x.provider,x.timeControl,x.rating])).toEqual([
   ["chesscom","rapid",1822],["chesscom","daily",1550],
   ["chesscom","puzzle",1999],
  ]);
  expect(rows[0].games).toBe(28);
  expect(rows[1].ratingDeviation).toBeNull();
  expect(rows[2].games).toBeNull();
 });
 it("rejects malformed provider data instead of pretending rating zero",()=>{
  expect(()=>parseLichessPerfs({perfs:null},now)).toThrow(/Malformed/);
  expect(()=>parseChesscomStats([],now)).toThrow(/Malformed/);
  expect(parseLichessPerfs({perfs:{rapid:{rating:99}}},now)).toHaveLength(0);
  expect(parseChesscomStats({chess_rapid:{last:{rating:4041}}},now)).toHaveLength(0);
 });
});
describe("Lichess private Puzzles numbering",()=>{
 it("honors existing max, not the number of studies or a missing gap",()=>{
  expect(nextPuzzleStudyName([])).toEqual({nextSuffix:1,nextName:"Puzzles"});
  expect(nextPuzzleStudyName(["Puzzles","Puzzles 2","Puzzles 4","Other"]))
   .toEqual({nextSuffix:5,nextName:"Puzzles 5"});
  expect(nextPuzzleStudyName(["Puzzles 2","Puzzles 3"]))
   .toEqual({nextSuffix:4,nextName:"Puzzles 4"});
 });
});
