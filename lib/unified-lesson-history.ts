/** Exact instructor time is an interval union across canonical sessions.
 * Group roster size never multiplies a teacher's actual minutes.
 */
export type LessonTimelineItem={
 id:string;kind:"coaching";startsAt:string;durationMinutes:number;
 status:string;studentIds:string[];workplaceId:string|null;
 delivered:boolean;booked:boolean;
};
export function unionMinutes(input:LessonTimelineItem[],flag:"booked"|"delivered"){
 const intervals=input.filter(item=>item[flag]).map(item=>{
  const start=Date.parse(item.startsAt);
  const end=start+item.durationMinutes*60_000;
  return {start,end};
 }).filter(item=>Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.end>item.start)
  .sort((a,b)=>a.start-b.start||a.end-b.end);
 let lastStart:number|null=null,lastEnd=0,minutes=0;
 for(const range of intervals){
  if(lastStart===null){lastStart=range.start;lastEnd=range.end;continue;}
  if(range.start<=lastEnd){lastEnd=Math.max(lastEnd,range.end);continue;}
  minutes+=(lastEnd-lastStart)/60_000;
  lastStart=range.start;lastEnd=range.end;
 }
 if(lastStart!==null)minutes+=(lastEnd-lastStart)/60_000;
 return Math.round(minutes);
}
