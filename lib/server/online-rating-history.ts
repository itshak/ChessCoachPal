import "server-only";
import {z} from "zod";
import {provider,ratingValue,timeControl} from "../chess-public-ratings";

type Provider=z.infer<typeof provider>;
type TimeControl=z.infer<typeof timeControl>;
const lichessPerf:Partial<Record<TimeControl,string>>={
 bullet:"bullet",blitz:"blitz",rapid:"rapid",classical:"classical",puzzle:"puzzle",
};
const maxBytes=1_048_576;
const maxSeries=32;
const maxPoints=40_000;
const dayMs=86_400_000;
const maxWindow=366;
type Point={date:string;rating:number};
type HistoryResult=
 | {status:"invalid_window"|"unsupported"|"too_large"|"malformed"}
 | {status:"cache_unknown"|"category_absent"|"no_points_in_window";coverage:"unknown"}
 | {status:"reported_points";coverage:"unknown";provenance:"lichess_rating_history";
  window:{from:string;through:string};firstReportedDate:string;lastReportedDate:string;points:Point[]};

function dateFromParts(year:unknown,month:unknown,day:unknown):string|null{
 if(typeof year!=="number"||!Number.isInteger(year)||year<2010||year>9999||
  typeof month!=="number"||!Number.isInteger(month)||month<0||month>11||
  typeof day!=="number"||!Number.isInteger(day)||day<1||day>31)return null;
 const date=new Date(Date.UTC(year,month,day));
 return date.getUTCMonth()===month&&date.getUTCDate()===day?date.toISOString().slice(0,10):null;
}
function parseIsoDay(input:string):number{
 const date=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(input);
 if(!date||dateFromParts(Number(date[1]),Number(date[2])-1,Number(date[3]))!==input)return NaN;
 return Date.parse(input);
}

/** Decode supplied provider bytes only. This contract is deliberately not a
 * fetcher, durable observation writer, or signal of total historical coverage. */
export function decodeOnlineRatingHistory(
 source:Provider,control:TimeControl,bytes:Uint8Array,
 window:{from:string;through:string},asOfDay:string,
):HistoryResult{
 const perf=source==="lichess"&&Object.hasOwn(lichessPerf,control)?lichessPerf[control]:undefined;
 if(!perf)return {status:"unsupported"};
 const start=parseIsoDay(window.from),end=parseIsoDay(window.through),limit=parseIsoDay(asOfDay);
 if(![start,end,limit].every(Number.isFinite)||start>end||end>limit||(end-start)/dayMs>=maxWindow)
  return {status:"invalid_window"};
 if(bytes.byteLength>maxBytes)return {status:"too_large"};
 let decoded:unknown;
 try{decoded=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
 catch{return {status:"malformed"};}
 if(!Array.isArray(decoded))return {status:"malformed"};
 if(decoded.length>maxSeries)return {status:"too_large"};
 if(decoded.length===0)return {status:"cache_unknown",coverage:"unknown"};
 const names=new Set<string>();
 let total=0,series:unknown[]|undefined;
 for(const value of decoded){
  if(!value||typeof value!=="object"||Array.isArray(value)||
   typeof value.name!=="string"||!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(value.name)||
   names.has(value.name)||!Array.isArray(value.points))return {status:"malformed"};
  names.add(value.name);
  total+=value.points.length;
  if(total>maxPoints)return {status:"too_large"};
  if(value.name===perf)series=value.points;
 }
 if(!series)return {status:"category_absent",coverage:"unknown"};
 const seen=new Set<string>(),points:Point[]=[];
 for(const item of series){
  if(!Array.isArray(item)||item.length!==4)return {status:"malformed"};
  const date=dateFromParts(item[0],item[1],item[2]);
  const rating=ratingValue.safeParse(item[3]);
  if(!date||date>asOfDay||!rating.success||seen.has(date))return {status:"malformed"};
  seen.add(date);
  if(date>=window.from&&date<=window.through)points.push({date,rating:rating.data});
 }
 if(!points.length)return {status:"no_points_in_window",coverage:"unknown"};
 points.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
 return {status:"reported_points",coverage:"unknown",provenance:"lichess_rating_history",
  window:{from:window.from,through:window.through},
  firstReportedDate:points[0]!.date,lastReportedDate:points.at(-1)!.date,points};
}
