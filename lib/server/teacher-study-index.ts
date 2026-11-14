import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherLichessStudiesSearch} from "@/lib/server/lichess-studies";
export const studyIndexSyncSchema=z.object({
 studyId:z.string().regex(/^[A-Za-z0-9]{8}$/),
 confirmedExternal:z.literal(true),
}).strict();
export const studyIndexSearchSchema=z.object({
 studyId:z.string().regex(/^[A-Za-z0-9]{8}$/).optional(),
 query:z.string().trim().max(120).optional(),
 chapterNumber:z.number().int().min(1).max(64).optional(),
 limit:z.number().int().min(1).max(100).default(50),
}).strict();
export const studyIndexGetSchema=z.object({
 studyId:z.string().regex(/^[A-Za-z0-9]{8}$/),
 chapterId:z.string().regex(/^[A-Za-z0-9]{8}$/),
}).strict();
export class StudyIndexError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new StudyIndexError(status,code,message);
type Db=SupabaseClient;
const fields="study_id,chapter_id,chapter_number,study_name,chapter_name,white_player,black_player,event_name,game_date,eco,opening,fen,verified_at";
const stale=(value:string)=>Date.now()-Date.parse(value)>24*60*60*1000;
export async function teacherStudyIndexSync(db:Db,teacherId:string,
 input:z.infer<typeof studyIndexSyncSchema>){
 const a=studyIndexSyncSchema.parse(input);
 const provider=await teacherLichessStudiesSearch(teacherId,{studyId:a.studyId,limit:100});
 if(provider.truncated||provider.chapterCount!==provider.matches.length||
   provider.chapterCount<1||provider.chapterCount>64)
   throw fail(422,"INCOMPLETE_STUDY","Study metadata cannot be indexed completely");
 const chapters=provider.matches.map(x=>{
  if(!x.chapterId)
   throw fail(422,"CHAPTER_ID_UNVERIFIED",
    "A chapter lacks an authentic Lichess chapter ID; preserve existing cache");
  return {studyName:x.studyName,chapterId:x.chapterId,
   chapterNumber:x.chapterNumber,chapterName:x.chapterName,
   white:x.white,black:x.black,event:x.event,date:x.date,eco:x.eco,
   opening:x.opening,fen:x.fen};
 });
 const {data,error}=await db.rpc("ccp_teacher_study_index_replace",{
  p_study_id:a.studyId,p_chapters:chapters,
 });
 if(error)throw fail(503,"INDEX_UNAVAILABLE","Cannot atomically save authorized chapter metadata");
 return {...data,tokenExposed:false,rawPgnStored:false};
}
export async function teacherStudyIndexSearch(db:Db,teacherId:string,
 input:z.infer<typeof studyIndexSearchSchema>){
 const a=studyIndexSearchSchema.parse(input),all:Record<string,unknown>[]=[];
 const batch=250;let exhausted=false;
 for(let offset=0;offset<20000;offset+=batch){
  let q=db.from("teacher_study_chapter_index").select(fields)
   .eq("teacher_id",teacherId).order("study_id").order("chapter_number")
   .range(offset,offset+batch-1);
  if(a.studyId)q=q.eq("study_id",a.studyId);
  if(a.chapterNumber)q=q.eq("chapter_number",a.chapterNumber);
  const {data,error}=await q;
  if(error||!data)throw fail(503,"INDEX_UNAVAILABLE","Cannot read authorized study metadata");
  all.push(...data);
  if(data.length<batch){exhausted=true;break;}
 }
 if(!exhausted)throw fail(413,"INDEX_LIMIT","Too many chapter records for a complete search");
 const key=a.query?.toLocaleLowerCase();
 const matches=all.filter(r=>!key||[
  r.chapter_name,r.study_name,r.white_player,r.black_player,r.event_name,
  r.eco,r.opening,r.game_date].some(v=>typeof v==="string"&&
   v.toLocaleLowerCase().includes(key)));
 return {matches:matches.slice(0,a.limit).map(r=>({
  ...r,stale:stale(r.verified_at as string),
  source:"AUTHORIZED_LICHESS_PGN_CACHE",
  chapterUrl:`https://lichess.org/study/${r.study_id}/${r.chapter_id}`,
 })),total:matches.length,truncated:matches.length>a.limit,
  mayBeStale:true,rawPgnStored:false,accessRequiresAuthenticatedTeacher:true};
}
export async function teacherStudyIndexGet(db:Db,teacherId:string,
 input:z.infer<typeof studyIndexGetSchema>){
 const a=studyIndexGetSchema.parse(input);
 const {data,error}=await db.from("teacher_study_chapter_index")
  .select(fields).eq("teacher_id",teacherId)
  .eq("study_id",a.studyId).eq("chapter_id",a.chapterId).maybeSingle();
 if(error)throw fail(503,"INDEX_UNAVAILABLE","Chapter lookup unavailable");
 if(!data)throw fail(404,"NOT_FOUND","No authorized indexed chapter with those IDs");
 return {...data,stale:stale(data.verified_at),source:"AUTHORIZED_LICHESS_PGN_CACHE",
  chapterUrl:`https://lichess.org/study/${data.study_id}/${data.chapter_id}`,
  rawPgnStored:false};
}
