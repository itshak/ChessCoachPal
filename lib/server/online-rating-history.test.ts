import {describe,expect,it} from "vitest";
import {decodeOnlineRatingHistory} from "./online-rating-history";

const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const window={from:"2024-02-28",through:"2024-03-04"};
const asOf="2024-03-06";
const rapid=(points:unknown)=>[{name:"rapid",points}];
const shown=(value:unknown)=>decodeOnlineRatingHistory("lichess","rapid",bytes(value),window,asOf);

describe("detached online rating history contract",()=>{
 it("projects only real category dates in its bounded window and sorts deterministically",()=>{
  const raw=bytes([{name:"ultraBullet",points:[[2024,2,2,1060]]},
   {name:"rapid",points:[[2024,2,4,1891],[2024,1,29,1830],[2024,2,5,2000],[2024,1,27,1801]]}]);
  expect(decodeOnlineRatingHistory("lichess","rapid",raw,window,asOf)).toEqual({
   status:"reported_points",coverage:"unknown",provenance:"lichess_rating_history",
   window,firstReportedDate:"2024-02-29",lastReportedDate:"2024-03-04",
   points:[{date:"2024-02-29",rating:1830},{date:"2024-03-04",rating:1891}],
  });
 });
 it("does not confuse an empty cache, missing series, or empty date window with no games",()=>{
  expect(shown([])).toEqual({status:"cache_unknown",coverage:"unknown"});
  expect(shown([{name:"blitz",points:[]}])).toEqual({status:"category_absent",coverage:"unknown"});
  expect(shown(rapid([]))).toEqual({status:"no_points_in_window",coverage:"unknown"});
  expect(shown(rapid([[2024,2,5,1700]]))).toEqual({status:"no_points_in_window",coverage:"unknown"});
  expect(decodeOnlineRatingHistory("chesscom","rapid",bytes(rapid([])),window,asOf))
   .toEqual({status:"unsupported"});
  expect(decodeOnlineRatingHistory("lichess","daily",bytes([{name:"correspondence",points:[]}]),window,asOf))
   .toEqual({status:"unsupported"});
 });
 it("rejects impossible days, duplicates, unknown clock-window inputs, and bad ratings",()=>{
  for(const row of [
   [2023,1,29,1600],[2024,1,30,1600],[2024,12,1,1600],[2024,2,7,1600],
   [2024,2,1,"1600"],[2024,2,1,0],[2024,2,1,1600,22],
  ])expect(shown(rapid([row]))).toEqual({status:"malformed"});
  for(const pair of [1600,1700])
   expect(shown(rapid([[2024,2,1,1600],[2024,2,1,pair]]))).toEqual({status:"malformed"});
  expect(shown([...rapid([]),...rapid([])])).toEqual({status:"malformed"});
  for(const invalid of [
   {from:"2024-02-30",through:window.through},{from:"2024-03-05",through:window.through},
   {from:"2023-02-01",through:window.through},{from:window.from,through:"2024-03-07"},
  ])expect(decodeOnlineRatingHistory("lichess","rapid",bytes([]),invalid,asOf))
   .toEqual({status:"invalid_window"});
 });
 it("bounds bytes, series and included or ignored point input without partial success",()=>{
  expect(decodeOnlineRatingHistory("lichess","rapid",new Uint8Array(1_048_577),window,asOf))
   .toEqual({status:"too_large"});
  const tooManySeries=Array.from({length:33},(_,i)=>({name:"variant"+i,points:[]}));
  expect(shown(tooManySeries))
   .toEqual({status:"too_large"});
  expect(shown([{name:"unknown",points:Array(40_001).fill([])}])).toEqual({status:"too_large"});
  expect(decodeOnlineRatingHistory("lichess","rapid",Uint8Array.of(0xff),window,asOf))
   .toEqual({status:"malformed"});
  expect(shown({name:"rapid",points:[]})).toEqual({status:"malformed"});
 });
});
