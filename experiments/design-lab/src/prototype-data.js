import {students,sessions} from "../../../app/design-lab/fixtures.ts";
export const anchor="2026-11-27";
export const dateAt=(offset=0,base=anchor)=>{const d=new Date(base+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
export const dateLabel=(date,locale,opts={weekday:"short",month:"short",day:"numeric"})=>new Intl.DateTimeFormat(locale,{...opts,timeZone:"UTC"}).format(new Date(date+"T12:00:00Z"));
export const weekStart=d=>dateAt(-((new Date(d+"T12:00:00Z").getUTCDay()+6)%7),d);
export function schedule(mode){
 const make=(id,index,offset,time,title)=>({...sessions[index%sessions.length],id,date:dateAt(offset),time:time||sessions[index%sessions.length].time,title:title||sessions[index%sessions.length].title,duration:60});
 const upcoming=[make("l2",1,1),make("l3",2,3),make("l4",0,6),make("l5",1,10)];
 if(mode==="none")return [];
 if(mode==="later")return [make("l2",1,10),make("l3",2,14)];
 if(mode==="quiet")return upcoming;
 if(mode==="busy")return [...Array.from({length:8},(_,i)=>make("b"+i,i,0,String(9+i).padStart(2,"0")+":00",["Endgame group","Maya — private lesson","Daniel — tactics","Junior group","Alexey — private lesson","Pawn endgames","Advanced group","Game analysis"][i])),...upcoming];
 return [make("l1",0,0),...upcoming];
}
export const previous=[{...sessions[0],id:"past1",date:dateAt(-2),duration:60},{...sessions[1],id:"past2",date:dateAt(-4),duration:60}];
export const followups=[{id:"f1",title:"Attendance missing",subtitle:"Endgame group",student:"s1",workplace:"Club",lesson:"past1"},{id:"f2",title:"Review homework",subtitle:"Maya Sample",student:"s2",workplace:"Private"},{id:"f3",title:"Billing review",subtitle:"Алексей Тестов",student:"s3",workplace:"Club"}];
export const studentRoster=students;
