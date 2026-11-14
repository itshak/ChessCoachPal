import {z} from "zod";

/**
 * Provider ratings are independent evidence, never an implicit 1-10
 * teacher assessment. Neither public handle is proof of account ownership.
 */
export const provider=z.enum(["lichess","chesscom"]);
export const timeControl=z.enum(["bullet","blitz","rapid","classical","daily","puzzle"]);
export const ratingValue=z.number().int().min(100).max(4000);
export const ratingRecordSchema=z.object({
  studentId:z.uuid(),provider,
  timeControl,rating:ratingValue.nullable(),
  ratingDeviation:z.number().int().min(0).max(1000).nullable().default(null),
  provisional:z.boolean().nullable().default(null),
  games:z.number().int().min(0).max(10000000).nullable().default(null),
  observedAt:z.iso.datetime({offset:true}),
  requestId:z.uuid(),confirmed:z.literal(true),
}).strict();
export const ratingFetchSchema=z.object({
  studentId:z.uuid(),provider,confirmedExternal:z.literal(true),
}).strict();
export const ratingListSchema=z.object({
  studentId:z.uuid(),provider:provider.optional(),timeControl:timeControl.optional(),
  limit:z.number().int().min(1).max(100).default(50),
  offset:z.number().int().min(0).max(100000).default(0),
}).strict();

export type RatingSnapshot={
  provider:z.infer<typeof provider>;timeControl:z.infer<typeof timeControl>;
  rating:number|null;ratingDeviation:number|null;provisional:boolean|null;
  games:number|null;source:"provider_api"|"teacher_manual";
  observedAt:string;fetchedAt:string|null;
};

/** Lichess perfs must be read by category; no cross-control averages. */
export function parseLichessPerfs(source:unknown,now:string):RatingSnapshot[]{
  const p=source as {perfs?:Record<string,{rating?:unknown;rd?:unknown;prov?:unknown;games?:unknown}>}|null;
  if(!p||typeof p!=="object"||!p.perfs||typeof p.perfs!=="object"||
    Array.isArray(p.perfs))throw new Error("Malformed public Lichess rating response");
  const result:RatingSnapshot[]=[];
  for(const [name,control] of [
    ["bullet","bullet"],["blitz","blitz"],["rapid","rapid"],
    ["classical","classical"],["puzzle","puzzle"],
  ] as const){
    const item=p.perfs[name];
    if(!item||typeof item!=="object"||Array.isArray(item))continue;
    const raw=item.rating;
    if(typeof raw!=="number"||!Number.isInteger(raw)||raw<100||raw>4000)continue;
    result.push({
      provider:"lichess",timeControl:control,rating:raw,
      ratingDeviation:typeof item.rd==="number"&&Number.isInteger(item.rd)&&
        item.rd>=0&&item.rd<=1000?item.rd:null,
      provisional:typeof item.prov==="boolean"?item.prov:null,
      games:typeof item.games==="number"&&Number.isSafeInteger(item.games)&&
        item.games>=0?item.games:null,
      source:"provider_api",observedAt:now,fetchedAt:now,
    });
  }
  return result;
}

/** Chess.com public stats: the last rating is *not* a Lichess rating. */
export function parseChesscomStats(source:unknown,now:string):RatingSnapshot[]{
  const data=source as Record<string,unknown>|null;
  if(!data||typeof data!=="object"||Array.isArray(data))
    throw new Error("Malformed public Chess.com rating response");
  const out:RatingSnapshot[]=[];
  for(const [field,control] of [
    ["chess_bullet","bullet"],["chess_blitz","blitz"],
    ["chess_rapid","rapid"],["chess_daily","daily"],
  ] as const){
    const stats=data[field] as {last?:{rating?:unknown;date?:unknown};
      record?:{win?:unknown;loss?:unknown;draw?:unknown}}|null;
    if(!stats||typeof stats!=="object"||Array.isArray(stats))continue;
    const raw=stats.last?.rating;
    if(typeof raw!=="number"||!Number.isInteger(raw)||raw<100||raw>4000)continue;
    const record=stats.record;
    const counts=record?[record.win,record.loss,record.draw]:[];
    const games=counts.length===3&&counts.every(x=>typeof x==="number"&&
      Number.isSafeInteger(x)&&x>=0)?(counts as number[]).reduce((a,b)=>a+b,0):null;
    const date=stats.last?.date;
    const epoch=typeof date==="number"&&Number.isFinite(date)&&date>=0&&
      date*1000<=Date.now()+86400000?new Date(date*1000).toISOString():now;
    out.push({
      provider:"chesscom",timeControl:control,rating:raw,
      ratingDeviation:null,provisional:null,games,
      source:"provider_api",observedAt:epoch,fetchedAt:now,
    });
  }
  // Public chess_puzzles is a separate puzzle score, never rapid.
  const puzzles=data.tactics as {highest?:{rating?:unknown}}|undefined;
  const rating=puzzles?.highest?.rating;
  if(typeof rating==="number"&&Number.isInteger(rating)&&rating>=100&&rating<=4000)
    out.push({provider:"chesscom",timeControl:"puzzle",rating,
      ratingDeviation:null,provisional:null,games:null,source:"provider_api",
      observedAt:now,fetchedAt:now});
  return out;
}
