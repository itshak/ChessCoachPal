/** Pure reconciliation across the two pre-1.0 lesson histories.
 * Exact teacher time is an interval union, not a sum of participant rows.
 * A detected duplicate is flagged, never silently deleted or rewritten.
 */
export type LessonTimelineItem={
 id:string;kind:"coaching"|"legacy";startsAt:string;durationMinutes:number;
 status:string;studentIds:string[];workplaceId:string|null;
 delivered:boolean;booked:boolean;possibleDuplicateOf?:string;
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
export function reconcileLessons<T extends LessonTimelineItem>(items:T[]){
 const coaching=items.filter(x=>x.kind==="coaching");
 const reconciled=items.map(x=>{
  if(x.kind!=="legacy")return x;
  const counterpart=coaching.find(s=>s.startsAt===x.startsAt&&
   s.durationMinutes===x.durationMinutes&&
   x.studentIds.some(id=>s.studentIds.includes(id)));
  return counterpart?{...x,possibleDuplicateOf:counterpart.id}:x;
 });
 return {entries:reconciled,
  possibleCrossModelDuplicates:reconciled.filter(x=>x.possibleDuplicateOf).length,
  bookedInstructorMinutes:unionMinutes(reconciled,"booked"),
  evidencedInstructorMinutes:unionMinutes(reconciled,"delivered"),
 };
}
