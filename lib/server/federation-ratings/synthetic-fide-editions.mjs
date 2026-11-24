// Offline executable contract, not a parser for any actual FIDE file.
import {createHash} from "node:crypto";

export const categories=Object.freeze(["standard","rapid","blitz"]);
const coverageValues=["complete","partial","absent"];
const activityValues=["explicit","unknown"];
const idPattern=/^[0-9]{5,12}$/;
const tokenPattern=/^[a-zA-Z0-9_-]{1,96}$/;
const periodPattern=/^\d{4}-(0[1-9]|1[0-2])-01$/;
const MAX_BYTES=256*1024,MAX_ROWS=5000,MAX_EDITIONS=120;
const HEADER="CCP-SYNTHETIC-FIDE-V1\n";
const fail=code=>{throw new Error(code);};
const exactKeys=(obj,keys)=>obj&&typeof obj==="object"&&Object.keys(obj).length===keys.length
 &&keys.every(key=>Object.hasOwn(obj,key));

function parse(descriptor,bytes){
 if(!exactKeys(descriptor,["token","effectiveAt","digest","recordCount","coverage","supersedes"])||
   typeof descriptor.token!=="string"||!tokenPattern.test(descriptor.token)||
   typeof descriptor.effectiveAt!=="string"||!periodPattern.test(descriptor.effectiveAt)||
   typeof descriptor.digest!=="string"||!/^[a-f0-9]{64}$/.test(descriptor.digest)||
   !Number.isInteger(descriptor.recordCount)||descriptor.recordCount<0||descriptor.recordCount>MAX_ROWS||
   !exactKeys(descriptor.coverage,categories)||
   !(descriptor.supersedes===null||typeof descriptor.supersedes==="string"&&
     tokenPattern.test(descriptor.supersedes)&&descriptor.supersedes!==descriptor.token))
  fail("INVALID_FIXTURE_DESCRIPTOR");
 const coverage={};
 for(const name of categories){
  const item=descriptor.coverage[name];
  if(!exactKeys(item,["list","activity"])||!coverageValues.includes(item.list)||
    !activityValues.includes(item.activity)||item.list==="absent"&&item.activity!=="unknown")
   fail("INVALID_FIXTURE_DESCRIPTOR");
  coverage[name]=Object.freeze({list:item.list,activity:item.activity});
 }
 if(!(bytes instanceof Uint8Array)||bytes.length>MAX_BYTES)fail("FIXTURE_BYTES_OUT_OF_BOUNDS");
 if(createHash("sha256").update(bytes).digest("hex")!==descriptor.digest)fail("FIXTURE_DIGEST_MISMATCH");
 let body;
 try{body=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);}catch{fail("INVALID_FIXTURE_ENCODING");}
 if(!body.startsWith(HEADER)||!body.endsWith("\n"))fail("INVALID_FIXTURE_ENVELOPE");
 const lines=body.slice(HEADER.length,-1).split("\n");
 if(body===HEADER)lines.pop();
 if(lines.length!==descriptor.recordCount)fail("FIXTURE_COUNT_MISMATCH");
 const rows=new Map();
 for(const line of lines){
  const fields=line.split("\t");
  const [id,category,rawRating,rawActivity,rawGames]=fields;
  if(fields.length!==5||!idPattern.test(id)||!categories.includes(category)||
    coverage[category].list==="absent"||
    !(rawRating==="unrated"||/^\d{3,4}$/.test(rawRating)&&Number(rawRating)>=100&&Number(rawRating)<=4000)||
    !["active","inactive","unknown","generic_inactive"].includes(rawActivity)||
    !/^(0|[1-9][0-9]{0,5})$/.test(rawGames))
   fail("INVALID_FIXTURE_ROW");
  const isExplicit=coverage[category].activity==="explicit";
  if(isExplicit?rawActivity==="generic_inactive":rawActivity==="active"||rawActivity==="inactive")
   fail("INVALID_FIXTURE_ACTIVITY");
  const key=id+":"+category;
  if(rows.has(key))fail("DUPLICATE_FIXTURE_ID_CATEGORY");
  rows.set(key,Object.freeze({rating:rawRating==="unrated"?null:Number(rawRating),
   status:rawRating==="unrated"?"unrated":"rated",activity:isExplicit?rawActivity:"unknown",
   games:Number(rawGames)}));
 }
 const evidence=Object.freeze({token:descriptor.token,effectiveAt:descriptor.effectiveAt,
  digest:descriptor.digest,recordCount:descriptor.recordCount,coverage:Object.freeze(coverage),
  supersedes:descriptor.supersedes});
 return {evidence,rows};
}

function exactIdentity(id){
 if(typeof id!=="string"||!idPattern.test(id))fail("INVALID_LINKED_ID");
}
function exactCategory(category){
 if(!categories.includes(category))fail("INVALID_FIXTURE_CATEGORY");
}
/**
 * The caller supplies trusted synthetic descriptor metadata, separate from fixture bytes.
 * This object verifies consistency, not genuine publication, authority or consent.
 * Its private state can only change via complete bounded validation; no network or persistence.
 */
export class SyntheticFideEditionLedger {
 #editions=new Map();

 accept(descriptor,bytes){
  const entry=parse(descriptor,bytes);
  const next=entry.evidence;
  const have=this.#editions.get(next.token);
  if(have){
   if(JSON.stringify(have.evidence)!==JSON.stringify(next))fail("FIXTURE_EDITION_CONFLICT");
   return Object.freeze({replayed:true,evidence:have.evidence});
  }
  if(this.#editions.size>=MAX_EDITIONS)fail("FIXTURE_LEDGER_FULL");
  if(next.supersedes!==null){
   const parent=this.#editions.get(next.supersedes)?.evidence;
   if(!parent||parent.effectiveAt!==next.effectiveAt)fail("INVALID_FIXTURE_LINEAGE");
   // An accepted correction may not downgrade any complete coverage to partial
   // or absent; doing so would make its silence falsely authoritative.
   if(categories.some(c=>parent.coverage[c].list==="complete"&&next.coverage[c].list!=="complete"))
    fail("INCOMPLETE_FIXTURE_CORRECTION");
  }
  this.#editions.set(next.token,entry);
  return Object.freeze({replayed:false,evidence:next});
 }

 history(){
  return Object.freeze(Array.from(this.#editions.values(),x=>x.evidence));
 }

 lookup(token,linkedId,category){
  exactIdentity(linkedId);exactCategory(category);
  const entry=this.#editions.get(token);
  if(!entry)fail("UNKNOWN_FIXTURE_EDITION");
  const coverage=entry.evidence.coverage[category].list;
  const row=entry.rows.get(linkedId+":"+category);
  return Object.freeze({linkedId,category,coverage,evidence:entry.evidence,
   rating:row?.rating??null,status:row?.status??(coverage==="complete"?"missing":"coverage_unknown"),
   activity:row?.activity??"unknown",games:row?.games??null});
 }

 current(linkedId,category,expectedPeriod){
  exactIdentity(linkedId);exactCategory(category);
  if(typeof expectedPeriod!=="string"||!periodPattern.test(expectedPeriod))fail("INVALID_FIXTURE_PERIOD");
  const eligible=this.history().filter(e=>e.effectiveAt<=expectedPeriod&&e.coverage[category].list==="complete");
  if(!eligible.length)return Object.freeze({status:"coverage_unknown",observation:null});
  const latest=eligible.reduce((day,e)=>e.effectiveAt>day?e.effectiveAt:day,"");
  const period=eligible.filter(e=>e.effectiveAt===latest);
  // A valid accepted predecessor chain has monotonically new tokens and
  // cannot cycle. Only a single leaf in this period can determine a winner.
  const ancestors=new Set(period.map(e=>e.supersedes));
  const leaves=period.filter(e=>!ancestors.has(e.token));
  if(leaves.length!==1)return Object.freeze({status:"edition_order_unknown",observation:null});
  return Object.freeze({status:latest===expectedPeriod?"current":"stale",
   observation:this.lookup(leaves[0].token,linkedId,category)});
 }
}
