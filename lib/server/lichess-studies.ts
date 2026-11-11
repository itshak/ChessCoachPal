import "server-only";
import {LichessConnectionError,authorizedLichessToken,lichessOrigin} from "@/lib/server/lichess-connections";

/**
 * Scoped Lichess study discovery, shared by the signed-in website and MCP.
 * No token or raw private PGN is returned to a client or language model.
 * Provider responses are size-bounded, never followed to another host.
 *
 * Lichess API: GET /api/study/by/{username} (NDJSON, study:read)
 *             GET /api/study/{studyId}.pgn (PGN, study:read)
 */
export type StudySearchInput={
  studyId?:string;query?:string;chapterNumber?:number;limit?:number;
};
const studyIdPattern=/^[A-Za-z0-9]{8}$/;
const fail=(status:number,code:string,message:string)=>
  new LichessConnectionError(status,code,message);
type StudySummary={id:string;name:string;createdAt:number|null;updatedAt:number|null};
type ChapterMatch={
  studyId:string;studyName:string;chapterNumber:number;chapterName:string;
  chapterUrl:string;eco:string|null;opening:string|null;fen:string|null;
};
function normalized(input:StudySearchInput){
  if(input.studyId!==undefined&&!studyIdPattern.test(input.studyId))
    throw fail(400,"VALIDATION_ERROR","Lichess study ID must have eight letters or digits");
  if(input.query!==undefined&&
     (typeof input.query!=="string"||input.query.length>120))
    throw fail(400,"VALIDATION_ERROR","Search text must be at most 120 characters");
  if(input.chapterNumber!==undefined&&
     (!Number.isInteger(input.chapterNumber)||input.chapterNumber<1||input.chapterNumber>64))
    throw fail(400,"VALIDATION_ERROR","Chapter number must be from 1 to 64");
  if(input.limit!==undefined&&
     (!Number.isInteger(input.limit)||input.limit<1||input.limit>100))
    throw fail(400,"VALIDATION_ERROR","Limit must be from 1 to 100");
  if(input.chapterNumber!==undefined&&!input.studyId)
    throw fail(400,"VALIDATION_ERROR","Choose a study ID before searching by chapter number");
  return {
    studyId:input.studyId,
    query:(input.query??"").trim().toLocaleLowerCase(),
    chapterNumber:input.chapterNumber,
    limit:input.limit??50,
  };
}
async function boundedText(response:Response,maxBytes:number):Promise<string>{
  const size=Number(response.headers.get("content-length")??"0");
  if(Number.isFinite(size)&&size>maxBytes)
    throw fail(413,"STUDY_TOO_LARGE","Lichess study exceeds the safe indexing limit; open it in Lichess");
  if(!response.body)throw fail(502,"PROVIDER_RESPONSE","Lichess returned an empty body");
  const reader=response.body.getReader();
  const chunks:Buffer[]=[];
  let bytes=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(value){
        bytes+=value.byteLength;
        if(bytes>maxBytes)throw fail(413,"STUDY_TOO_LARGE","Lichess study exceeds the safe indexing limit; open it in Lichess");
        chunks.push(Buffer.from(value));
      }
    }
  }finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString("utf8");
}
async function providerRead(path:string,token:string,accept:string,limit:number){
  let res:Response;
  try {
    res=await fetch(lichessOrigin()+path,{
      headers:{Authorization:"Bearer "+token,Accept:accept},
      cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),
    });
  } catch {
    throw fail(502,"PROVIDER_UNAVAILABLE","Lichess study service is unavailable");
  }
  if(res.status===401)throw fail(409,"RECONNECT_REQUIRED","Reconnect your Lichess account");
  if(res.status===403)throw fail(403,"SCOPE_DENIED","Lichess study:read permission is required");
  if(res.status===404)throw fail(404,"NOT_FOUND","Lichess study not found or inaccessible");
  if(res.status===429)throw fail(503,"PROVIDER_RATE_LIMIT","Lichess asked us to slow down; retry later");
  if(!res.ok)throw fail(502,"PROVIDER_RESPONSE","Lichess could not return the study");
  return boundedText(res,limit);
}
function metadata(ndjson:string,query:string,limit:number){
  const studies:StudySummary[]=[];
  let truncated=false;
  const seen=new Set<string>();
  for(const line of ndjson.split(/\r?\n/)){
    if(!line.trim())continue;
    let value:unknown;
    try{value=JSON.parse(line);}catch{
      throw fail(502,"PROVIDER_RESPONSE","Invalid Lichess study metadata");
    }
    if(!value||typeof value!=="object")continue;
    const item=value as Record<string,unknown>;
    if(typeof item.id!=="string"||!studyIdPattern.test(item.id)||
      typeof item.name!=="string"||!item.name||item.name.length>300)continue;
    if(seen.has(item.id))continue;
    seen.add(item.id);
    if(query&&!item.name.toLocaleLowerCase().includes(query))continue;
    if(studies.length>=limit){truncated=true;break;}
    studies.push({
      id:item.id,name:item.name,
      createdAt:typeof item.createdAt==="number"?item.createdAt:null,
      updatedAt:typeof item.updatedAt==="number"?item.updatedAt:null,
    });
  }
  return {studies,truncated};
}
function chapterTags(block:string){
  const tags=new Map<string,string>();
  for(const match of block.matchAll(/^\[([A-Za-z][A-Za-z0-9]*)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm))
    tags.set(match[1],match[2].replace(/\\(["\\])/g,"$1"));
  return tags;
}
/** PGN chapter ordering is authoritative, including chapter 32 and beyond. */
export function searchPgnStudy(studyId:string,pgn:string,options:{
 query?:string;chapterNumber?:number;limit?:number;
}):{matches:ChapterMatch[];chapterCount:number;truncated:boolean}{
  if(!studyIdPattern.test(studyId))
    throw fail(400,"VALIDATION_ERROR","Invalid Lichess study ID");
  const query=(options.query??"").trim().toLocaleLowerCase();
  const limit=options.limit??50;
  if(!Number.isInteger(limit)||limit<1||limit>100)
    throw fail(400,"VALIDATION_ERROR","Invalid study result limit");
  const starts=[...pgn.matchAll(/^\[Event\s+"/gm)].map(m=>m.index??0);
  if(!starts.length)throw fail(502,"PROVIDER_RESPONSE","Lichess study PGN did not contain chapter metadata");
  const matches:ChapterMatch[]=[];
  let truncated=false;
  for(let i=0;i<starts.length;i++){
    const block=pgn.slice(starts[i],starts[i+1]??pgn.length);
    const tags=chapterTags(block);
    const chapterUrlTag=tags.get("ChapterURL")??"";
    const parts=/^https:\/\/lichess\.org\/study\/([A-Za-z0-9]{8})\/([A-Za-z0-9]{8})$/.exec(chapterUrlTag);
    const safeChapterId=parts?.[1]===studyId?parts[2]:null;
    const chapterName=tags.get("ChapterName")??`Chapter ${i+1}`;
    const studyName=tags.get("StudyName")??"Lichess Study";
    const opening=tags.get("Opening")??null;
    const eco=tags.get("ECO")??null;
    const fen=tags.get("FEN")??null;
    if(options.chapterNumber!==undefined&&options.chapterNumber!==i+1)continue;
    if(query&&![chapterName,studyName,opening,eco,tags.get("Event"),fen]
      .some(x=>x?.toLocaleLowerCase().includes(query)))continue;
    if(matches.length>=limit){truncated=true;break;}
    matches.push({
      studyId,studyName,chapterNumber:i+1,chapterName,
      chapterUrl:safeChapterId?`https://lichess.org/study/${studyId}/${safeChapterId}`:
        `https://lichess.org/study/${studyId}`,
      eco,opening,fen,
    });
  }
  return {matches,chapterCount:starts.length,truncated};
}
export async function teacherLichessStudiesSearch(
  teacherId:string,input:StudySearchInput
){
  const a=normalized(input);
  const {token,username}=await authorizedLichessToken(teacherId,"study:read");
  if(!a.studyId){
    const raw=await providerRead(
      `/api/study/by/${encodeURIComponent(username)}`,token,"application/x-ndjson",1024*1024);
    const list=metadata(raw,a.query,a.limit);
    return {username,studies:list.studies,matches:[] as ChapterMatch[],
      chapterCount:0,truncated:list.truncated};
  }
  const raw=await providerRead(
    `/api/study/${a.studyId}.pgn?clocks=false&comments=false&variations=false`,
    token,"application/x-chess-pgn",2*1024*1024);
  const found=searchPgnStudy(a.studyId,raw,{
    query:a.query,chapterNumber:a.chapterNumber,limit:a.limit,
  });
  return {username,studies:[] as StudySummary[],...found};
}
