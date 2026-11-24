import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {SyntheticFideEditionLedger,categories} from "./synthetic-fide-editions.mjs";

const A="900000000201", B="900000000202";
const M1="2025-01-01", M2="2025-02-01";
const header="CCP-SYNTHETIC-FIDE-V1\n";
const row=(id,category,rating,activity="unknown",games=0)=>[id,category,rating,activity,games].join("\t");
const three=[row(A,"standard",1813,"active"),row(A,"rapid",1747,"active"),row(A,"blitz",1691,"inactive")];
function fixture(token,lines=[],options={}){
 const bytes=Buffer.from(header+lines.map(x=>x+"\n").join(""));
 const coverage=Object.fromEntries(categories.map(c=>[c,{list:"complete",activity:"explicit"}]));
 return [{token,effectiveAt:M1,digest:createHash("sha256").update(bytes).digest("hex"),
  recordCount:lines.length,coverage,supersedes:null,...options},bytes];
}

test("explicit category activity is separate from publication and zero games",()=>{
 const ledger=new SyntheticFideEditionLedger();
 ledger.accept(...fixture("edition",three));
 for(const [category,rating,activity] of [["standard",1813,"active"],["rapid",1747,"active"],["blitz",1691,"inactive"]]){
  const current=ledger.current(A,category,M1);
  assert.equal(current.status,"current");
  assert.deepEqual([current.observation.rating,current.observation.status,current.observation.activity,current.observation.games],
                   [rating,"rated",activity,0]);
 }
 assert.equal(ledger.lookup("edition",B,"blitz").status,"missing");
 assert.throws(()=>ledger.lookup("edition"," "+A,"blitz"),/INVALID_LINKED_ID/);
 assert.throws(()=>ledger.lookup("edition",null,"blitz"),/INVALID_LINKED_ID/);
 assert.throws(()=>ledger.lookup("edition",A,"national"),/INVALID_FIXTURE_CATEGORY/);
});

test("combined generic flags cannot claim any category activity",()=>{
 const ledger=new SyntheticFideEditionLedger();
 const [desc,bytes]=fixture("combined",categories.map((c,i)=>row(A,c,1800+i,"generic_inactive")));
 for(const cat of categories)desc.coverage[cat].activity="unknown";
 ledger.accept(desc,bytes);
 for(const [i,cat] of categories.entries()){
  const x=ledger.lookup("combined",A,cat);
  assert.equal(x.activity,"unknown");assert.equal(x.rating,1800+i);
 }
 const [bad,raw]=fixture("invalid",[row(A,"blitz",1860,"inactive")]);
 bad.coverage.blitz.activity="unknown";
 assert.throws(()=>ledger.accept(bad,raw),/INVALID_FIXTURE_ACTIVITY/);
});

test("partial and absent scopes do not imply unrating or advance current evidence",()=>{
 const ledger=new SyntheticFideEditionLedger();
 ledger.accept(...fixture("previous",three));
 const [desc,bytes]=fixture("partial",[row(B,"blitz",1640),row(A,"standard","unrated")],{effectiveAt:M2});
 desc.coverage.blitz.list="partial";
 desc.coverage.rapid={list:"absent",activity:"unknown"};
 ledger.accept(desc,bytes);
 for(const cat of ["rapid","blitz"]){
  assert.equal(ledger.lookup("partial",A,cat).status,"coverage_unknown");
  const current=ledger.current(A,cat,M2);
  assert.equal(current.status,"stale");assert.equal(current.observation.status,"rated");
 }
 assert.equal(ledger.lookup("partial",B,"blitz").status,"rated");
 assert.equal(ledger.current(B,"blitz",M2).observation.status,"missing");
 const explicit=ledger.current(A,"standard",M2);
 assert.equal(explicit.observation.status,"unrated");assert.equal(explicit.observation.rating,null);
 assert.equal(ledger.lookup("previous",A,"standard").rating,1813);
 const empty=new SyntheticFideEditionLedger();
 empty.accept(desc,bytes);
 assert.deepEqual(empty.current(A,"rapid",M2),{status:"coverage_unknown",observation:null});
});

test("replay, rejected lineage, ambiguous forks and a trusted supersession never guess order",()=>{
 const ledger=new SyntheticFideEditionLedger();
 const original=fixture("opaque_9",three);
 const saved=ledger.accept(...original);
 assert.equal(saved.replayed,false);assert.equal(ledger.accept(...original).replayed,true);
 assert.throws(()=>{ saved.evidence.coverage.blitz.list="absent"; },TypeError);
 assert.throws(()=>ledger.accept(...fixture("opaque_9",[row(A,"standard",2000)])),/EDITION_CONFLICT/);
 assert.throws(()=>ledger.accept(...fixture("bad_base",three,{supersedes:"not-present"})),/INVALID_FIXTURE_LINEAGE/);
 assert.throws(()=>ledger.accept(...fixture("bad_month",three,{supersedes:"opaque_9",effectiveAt:M2})),/INVALID_FIXTURE_LINEAGE/);
 const [partial,bytes]=fixture("bad_coverage",three,{supersedes:"opaque_9"});
 partial.coverage.rapid.list="partial";
 assert.throws(()=>ledger.accept(partial,bytes),/INCOMPLETE_FIXTURE_CORRECTION/);
 assert.equal(ledger.history().length,1);
 const changed=three.map(x=>x.replace("inactive","active"));
 ledger.accept(...fixture("opaque_10",changed,{supersedes:"opaque_9"}));
 assert.equal(ledger.current(A,"blitz",M1).observation.evidence.token,"opaque_10");
 assert.equal(ledger.current(A,"blitz",M1).observation.rating,1691);
 assert.equal(ledger.lookup("opaque_9",A,"blitz").activity,"inactive");
 ledger.accept(...fixture("opaque_2",three,{supersedes:"opaque_9"}));
 assert.deepEqual(ledger.current(A,"blitz",M1),{status:"edition_order_unknown",observation:null});
 assert.equal(ledger.history().length,3);
 ledger.accept(...fixture("next_month",three,{effectiveAt:M2}));
 assert.equal(ledger.current(A,"blitz",M2).observation.evidence.token,"next_month");
 assert.equal(ledger.current(A,"blitz",M1).status,"edition_order_unknown");
});

test("invalid bytes, counts and duplicate IDs fail atomically",()=>{
 const ledger=new SyntheticFideEditionLedger();
 const good=fixture("good",three);
 ledger.accept(...good);
 const [desc,bytes]=fixture("discard",three);
 assert.throws(()=>ledger.accept(desc,Buffer.concat([bytes,Buffer.from("x")])),/DIGEST_MISMATCH/);
 assert.throws(()=>ledger.accept({...desc,recordCount:2},bytes),/COUNT_MISMATCH/);
 assert.throws(()=>ledger.accept(desc,Buffer.alloc(256*1024+1)),/BYTES_OUT_OF_BOUNDS/);
 const badUtf=Buffer.from([255]);
 assert.throws(()=>ledger.accept({...desc,digest:createHash("sha256").update(badUtf).digest("hex")},badUtf),/ENCODING/);
 const notFixture=Buffer.from("NAME,ID\n");
 assert.throws(()=>ledger.accept({...desc,digest:createHash("sha256").update(notFixture).digest("hex")},notFixture),/ENVELOPE/);
 assert.throws(()=>ledger.accept(...fixture("duplicate",[three[0],three[0]])),/DUPLICATE_FIXTURE_ID_CATEGORY/);
 assert.throws(()=>ledger.accept(...fixture("zero",[row(A,"rapid",0)])),/INVALID_FIXTURE_ROW/);
 assert.equal(ledger.history().length,1);
 assert.equal(ledger.current(A,"standard",M1).observation.rating,1813);
});

test("an overdue edition remains last-known and cannot stand in for a corrected linked ID",()=>{
 const ledger=new SyntheticFideEditionLedger();
 ledger.accept(...fixture("old",three));
 ledger.accept(...fixture("future",[row(B,"standard",1910)],{effectiveAt:"2025-03-01"}));
 const old=ledger.current(A,"standard",M2);
 assert.equal(old.status,"stale");
 assert.equal(old.observation.rating,1813);
 const newId=ledger.current(B,"standard",M2);
 assert.equal(newId.observation.rating,null);
 assert.equal(newId.observation.status,"missing");
 assert.equal(ledger.current(B,"standard","2025-03-01").observation.rating,1910);
});
