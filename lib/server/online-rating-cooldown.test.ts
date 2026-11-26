import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {onlineRatingCooldown} from "./online-rating-cooldown";
import {fetchOnlineRatingPayload,OnlineRatingProviderLimited,StudentRatingError} from "./online-rating-transport";

const at=Date.parse("Thu, 26 Nov 2026 08:00:00 GMT");
const wait=(seconds:number)=>({kind:"until",retryAt:at+seconds*1000});

describe("rate-limit hints",()=>{
 it("applies provider fallbacks and won't accept malformed or past hints as permission now",()=>{
  for(const value of [null,"","-3","0.5","0, 5","Thu, 31 Nov 2026 08:01:00 GMT"]){
   expect(onlineRatingCooldown("lichess",value,at)).toEqual(wait(60));
   expect(onlineRatingCooldown("chesscom",value,at)).toEqual(wait(120));
  }
  expect(onlineRatingCooldown("lichess"," 00007 ",at)).toEqual(wait(60));
  expect(onlineRatingCooldown("lichess","Thu, 26 Nov 2026 07:00:00 GMT",at)).toEqual(wait(60));
 });
 it("honors valid delays and preserves an operator hold instead of silently shortening them",()=>{
  expect(onlineRatingCooldown("lichess","137",at)).toEqual(wait(137));
  expect(onlineRatingCooldown("chesscom","Thu, 26 Nov 2026 08:03:10 GMT",at)).toEqual(wait(190));
  expect(onlineRatingCooldown("lichess","86400",at)).toEqual(wait(86400));
  for(const value of ["86401","999999999999999999999","Fri, 27 Nov 2026 08:00:01 GMT"]){
   expect(onlineRatingCooldown("lichess",value,at)).toEqual({kind:"operator_hold"});
  }
  expect(onlineRatingCooldown("lichess","65",NaN)).toEqual({kind:"operator_hold"});
 });
 it("extracts only a typed cooldown for 429 without introducing a second request or exposing the body",async()=>{
  vi.spyOn(Date,"now").mockReturnValue(at);
  try{
   const request=vi.fn(async()=>new Response("synthetic private response",{status:429,headers:{"retry-after":"91"}}));
   const caught=await fetchOnlineRatingPayload("lichess","Synthetic",request,{NODE_ENV:"test"}).catch((error:unknown)=>error);
   expect(caught).toBeInstanceOf(OnlineRatingProviderLimited);
   expect(caught).toBeInstanceOf(StudentRatingError);
   expect(caught).toMatchObject({status:429,code:"RATE_LIMITED",cooldown:wait(91),message:"Rating provider rate limit; retry later"});
   expect(request).toHaveBeenCalledTimes(1);
  }finally{vi.restoreAllMocks();}
 });
});
