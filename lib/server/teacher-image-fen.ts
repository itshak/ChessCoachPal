import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {fenBoard,PuzzleReviewError} from "@/lib/lichess-puzzles";
import {getPolicy} from "@/lib/server/scheduling";

export class ImageFenError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>
 new ImageFenError(status,code,message);

export type ImageFenInput={
 imageBase64:string;
 mediaType:"image/png"|"image/jpeg"|"image/webp";
 confirmedExternal:true;
};
export const MAX_FEN_IMAGE_BYTES=2*1024*1024;
export const MAX_FEN_IMAGE_BASE64=Math.ceil(MAX_FEN_IMAGE_BYTES/3)*4+4;
export const imageFenInputSchema=z.object({
 imageBase64:z.string().min(16).max(MAX_FEN_IMAGE_BASE64),
 mediaType:z.enum(["image/png","image/jpeg","image/webp"]),
 confirmedExternal:z.literal(true),
}).strict();
export const imageFenWebsiteSchema=imageFenInputSchema.extend({
 kind:z.literal("image"),
}).strict();
function validatedImage(input:ImageFenInput):Buffer{
 if(!input||input.confirmedExternal!==true)
  throw fail(400,"CONFIRMATION_REQUIRED",
    "Explicit teacher approval is required to share a board image with external AI");
 if(!["image/png","image/jpeg","image/webp"].includes(input.mediaType))
  throw fail(400,"VALIDATION_ERROR","Use a PNG, JPEG or WebP board image");
 if(typeof input.imageBase64!=="string"||
    input.imageBase64.length<16||input.imageBase64.length>MAX_FEN_IMAGE_BASE64||
    input.imageBase64.length%4!==0||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64))
  throw fail(400,"VALIDATION_ERROR","Invalid or oversized base64 board image");
 const bytes=Buffer.from(input.imageBase64,"base64");
 if(bytes.length<32||bytes.length>MAX_FEN_IMAGE_BYTES||
    bytes.toString("base64")!==input.imageBase64)
  throw fail(400,"VALIDATION_ERROR","Invalid or oversized board image");
 const isPng=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const isWebp=bytes.toString("ascii",0,4)==="RIFF"&&
   bytes.toString("ascii",8,12)==="WEBP";
 if(!(input.mediaType==="image/png"&&isPng||
      input.mediaType==="image/jpeg"&&isJpeg||
      input.mediaType==="image/webp"&&isWebp))
  throw fail(400,"VALIDATION_ERROR","Board image does not match its declared format");
 return bytes;
}
const PROMPT=[
 "Read ONLY the chessboard in this photograph or screenshot.",
 "Return a JSON object with exactly {\"fen\":string|null,\"notes\":string}.",
 "If piece colors, exact squares, or board orientation are ambiguous, return fen:null.",
 "Use standard FEN: 8 ranks from black's home rank (8) to white's (1).",
 "A static image cannot prove game-state fields. Use w - - 0 1 ONLY as",
 "explicit temporary placeholders for side, castling, en-passant and clocks.",
 "Do not guess a legal move, invent missing chess pieces, or claim certainty.",
 "Do not include text or markdown outside JSON.",
].join(" ");

function parseProviderFen(content:unknown){
 if(typeof content!=="string"||content.length>4000)
  throw fail(502,"AI_UNAVAILABLE","AI did not return a readable chess position");
 let value:unknown;
 try{value=JSON.parse(content);}
 catch{throw fail(502,"AI_UNAVAILABLE","AI did not return a valid position proposal");}
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw fail(502,"AI_UNAVAILABLE","AI returned an invalid position proposal");
 const proposal=value as {fen?:unknown};
 if(proposal.fen===null)
  throw fail(422,"REVIEW_REQUIRED",
    "The image is ambiguous; enter or correct a FEN manually after reviewing every square");
 if(typeof proposal.fen!=="string"||proposal.fen.length>120)
  throw fail(422,"REVIEW_REQUIRED","The image did not yield a reviewable chess position");
 try{
  // A still image only establishes a proposed piece placement. The vision
  // provider must never determine game-state fields that the photo cannot
  // prove. Always neutralize its guessed turn, rights, target and clocks.
  const placement=proposal.fen.trim().split(/\s+/)[0];
  const parsed=fenBoard(placement+" w - - 0 1");
  return {
   proposedFen:parsed.canonical,
   board:parsed.board,
   sideToMove:parsed.sideToMove,
   needsTeacherReview:true,
   source:"UNVERIFIED_IMAGE_AI_PROPOSAL",
   unknownGameState:["sideToMove","castlingRights","enPassant","halfmoveClock","fullmoveNumber"],
   warning:"Check all 64 squares, orientation and piece colors. Side to move, castling, en-passant and counters cannot be certified from an image; the suggested FEN uses placeholders. Correct it before creating any PGN or Lichess chapter.",
  };
 }catch(error){
  if(error instanceof PuzzleReviewError)
   throw fail(422,"REVIEW_REQUIRED","AI proposed an invalid FEN; review and enter the position manually");
  throw error;
 }
}
async function requestProvider(provider:"openai"|"anthropic",apiKey:string,input:ImageFenInput){
 let response:Response;
 try{
  response=await fetch(provider==="openai"?
    "https://api.openai.com/v1/chat/completions":
    "https://api.anthropic.com/v1/messages",{
   method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000),
   headers:provider==="openai"?{
    Authorization:"Bearer "+apiKey,"Content-Type":"application/json",
   }:{
    "x-api-key":apiKey,"anthropic-version":"2023-06-01",
    "Content-Type":"application/json",
   },
   body:JSON.stringify(provider==="openai"?{
    model:"gpt-4o-mini",max_tokens:400,temperature:0,
    response_format:{type:"json_object"},
    messages:[{role:"user",content:[
     {type:"text",text:PROMPT},
     {type:"image_url",image_url:{url:"data:"+input.mediaType+
       ";base64,"+input.imageBase64,detail:"high"}},
    ]}],
   }:{
    model:"claude-haiku-4-5-20251001",max_tokens:400,
    messages:[{role:"user",content:[
     {type:"image",source:{type:"base64",media_type:input.mediaType,data:input.imageBase64}},
     {type:"text",text:PROMPT},
    ]}],
   }),
  });
 }catch{
  throw fail(502,"AI_UNAVAILABLE","Image recognition provider unavailable; enter FEN manually");
 }
 if(!response.ok)throw fail(response.status===429?429:502,"AI_UNAVAILABLE",
   "Image recognition provider did not accept the request; check your connection and try later");
 let payload:unknown;
 try{payload=await response.json();}
 catch{throw fail(502,"AI_UNAVAILABLE","Image recognition returned unreadable data");}
 const value=payload as {
  choices?:{message?:{content?:unknown}}[];
  content?:{type?:string;text?:unknown}[];
 }|null;
 return provider==="openai"?value?.choices?.[0]?.message?.content:
   value?.content?.find(part=>part.type==="text")?.text;
}
/** Teacher-scoped, BYO-AI image-to-FEN PROPOSAL only. No Lichess or database
 * write occurs. Browser and delegated MCP call this same validation boundary.
 */
export async function teacherImageFenPropose(
 db:SupabaseClient,teacherId:string,input:ImageFenInput
){
 validatedImage(input); // always preflight size, consent and file magic BEFORE provider
 const policy=await getPolicy(db,teacherId);
 if(!policy.ai_api_key||!["openai","anthropic"].includes(policy.ai_provider))
  throw fail(400,"NOT_CONFIGURED",
   "Configure an optional vision-capable AI provider in the secure website settings");
 const text=await requestProvider(policy.ai_provider as "openai"|"anthropic",
   policy.ai_api_key,input);
 return parseProviderFen(text);
}
