import {spawnSync} from "node:child_process";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const tool=fileURLToPath(new URL("./compare-schema-freeze.mjs",import.meta.url));
const schema="public";
const table="teachers";
const receipt={schema,object_kind:"relation",object_identity:table,grantor:"postgres",
  grantee:"authenticated",privilege:"SELECT",grantable:false};
function snapshot(){
  return {
    format:2,
    tables:[...["teachers","students","workplaces","plan_versions"]
      .map(name=>({schema,name,kind:"r"})),{schema,name:"example_view",kind:"v",view_definition:"SELECT 1;"}],
    columns:[{schema,table,name:"id"}],
    constraints:[{schema,table,name:"teachers_pkey"}],
    indexes:[{schema,table,name:"teachers_pkey"}],
    triggers:[{schema,table,name:"example_trigger"}],
    policies:[{schema,table,name:"example_policy"}],
    functions:[{schema,identity:"example()",owner:"postgres"}],
    grants:[receipt,{...receipt,grantor:"another_owner"}],
    sequences:[],types:[],extensions:[{name:"btree_gist"}],
  };
}

function compare(source,target) {
  const dir=mkdtempSync(join(tmpdir(),"ccp-compare-schema-"));
  try{
    const a=join(dir,"source.json"), b=join(dir,"target.json");
    writeFileSync(a,JSON.stringify(source)); writeFileSync(b,JSON.stringify(target));
    return spawnSync(process.execPath,[tool,a,b],{encoding:"utf8"});
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
}

test("equal valid snapshots accept unsorted rows and distinct grantors",()=>{
  const source=snapshot(),target=snapshot();
  target.tables.reverse(); target.grants.reverse();
  const result=compare(source,target);
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{equal:true,differences:[]});
});

test("identical empty, incomplete, and old-format snapshots cannot pass",()=>{
  const empty=Object.fromEntries(Object.keys(snapshot()).map(key=>[key,[]]));
  empty.format=2;
  const missing=snapshot(); missing.tables.splice(1,1);
  const obsolete=snapshot(); delete obsolete.format;
  assert.match(compare(empty,empty).stderr,/empty tables/);
  assert.match(compare(missing,missing).stderr,/missing public\.students/);
  assert.match(compare(obsolete,obsolete).stderr,/Unsupported snapshot format/);
  for(const invalid of [empty,missing,obsolete]) assert.equal(compare(invalid,invalid).status,2);
});

test("view definition, routine ownership, and grantor drift are differences",()=>{
  const source=snapshot(),target=snapshot();
  target.tables.at(-1).view_definition="SELECT 2;";
  target.functions[0].owner="another_owner";
  target.grants[1].grantor="new_owner";
  const result=compare(source,target);
  assert.equal(result.status,1,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).differences.map(({section,change})=>[section,change]),[
    ["functions","definition_mismatch"],
    ["grants","missing_in_target"],
    ["grants","unexpected_in_target"],
    ["tables","definition_mismatch"],
  ]);
});
