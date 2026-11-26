import "server-only";
import {z} from "zod";
import {provider} from "../chess-public-ratings";
import {runOnlineRatingBatch} from "./online-rating-batch";

const request=z.object({
 provider,
 confirmed:z.literal(true),
 enqueue:z.number().int().min(0).max(8),
 work:z.number().int().min(0).max(2),
}).strict().refine(x=>x.enqueue+x.work>0,"At least one bounded operation required");
type Scope=Readonly<z.infer<typeof request>>;
type BatchDependencies=Parameters<typeof runOnlineRatingBatch>[1];
type Dependencies=Pick<BatchDependencies,"db"|"transport">&{
 /** Trusted operator capability for this deployment, not a caller-provided boolean. */
 isAllowed?: (scope:Scope)=>boolean;
};
const zero={enqueue:0,work:0};

/** In-process invocation seam only. No route, scheduler, credentials or real transport.
 * The caller must establish and supply a trusted capability and a scoped transport.
 * Authorization can stop future operations, not recall already dispatched ones. */
export async function runOnlineRatingOperatorPass(input:unknown,deps:Dependencies){
 const parsed=request.safeParse(input);
 if(!parsed.success)return {status:"invalid"} as const;
 const scope=Object.freeze(parsed.data);
 const allowed=()=>{try{return deps.isAllowed?.(scope)===true;}catch{return false;}};
 if(!allowed())return {status:"disabled"} as const;
 const selected={enqueue:scope.enqueue,work:scope.work};
 return runOnlineRatingBatch({
  lichess:scope.provider==="lichess"?selected:zero,
  chesscom:scope.provider==="chesscom"?selected:zero,
 },{
  db:deps.db,transport:deps.transport,
  enabled:allowed,providerEnabled:key=>key===scope.provider&&allowed(),
 });
}
