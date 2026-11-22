import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const script=fileURLToPath(new URL("./schema-freeze-lock.mjs",import.meta.url));
const dir="supabase/migrations";
const sql=`${dir}/20261107000000_chesscoachpal_baseline.sql`;
const manifest="scripts/schema-transition-manifest.json";
const lock="scripts/schema-freeze-lock.json";
const initial={ [sql]:"-- canonical\n", [manifest]:'{"mode":"canonical"}\n' };
const digest=value=>createHash("sha256").update(value).digest("hex");

function fixture(t) {
  const cwd=mkdtempSync(join(tmpdir(),"ccp-schema-freeze-"));
  t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  mkdirSync(join(cwd,dir),{recursive:true});
  mkdirSync(join(cwd,"scripts"));
  const write=(path,content)=>writeFileSync(join(cwd,path),content);
  const git=(...args)=>execFileSync("git",["-c","user.name=Fixture","-c","user.email=fixture@example.test",...args],{cwd,encoding:"utf8"}).trim();
  const save=message=>{git("add",".");git("commit","-qm",message);return git("rev-parse","HEAD");};
  const run=(base)=>spawnSync(process.execPath,[script,...(base?["--base",base]:[])],{cwd,encoding:"utf8"});
  git("init","-q");
  Object.entries(initial).forEach(([path,value])=>write(path,value));
  const accepted=save("candidate");
  const begin=(sha=accepted,content=initial)=>write(lock,JSON.stringify({
    version:1,acceptedSourceCommit:sha,
    sha256:Object.fromEntries(Object.entries(content).map(([path,value])=>[path,digest(value)])),
  }));
  return {cwd,write,save,run,accepted,begin};
}

test("a candidate without a lock remains explicitly unfrozen; accepted lock permits code-only changes",t=>{
  const f=fixture(t);
  assert.match(f.run(f.accepted).stdout,/not active/);
  f.begin();
  assert.equal(f.run(f.accepted).status,0);
  const frozen=f.save("freeze");
  f.write("ordinary-feature.ts","export {};\n");
  assert.equal(f.run(frozen).status,0);
});

test("a frozen branch rejects coordinated changes, a rewritten lock, deletion, and new migrations",t=>{
  const f=fixture(t);
  f.begin();
  const frozen=f.save("freeze");
  const changed={ [sql]:"-- changed\n", [manifest]:'{"mode":"duped"}\n' };
  Object.entries(changed).forEach(([path,value])=>f.write(path,value));
  assert.match(f.run(frozen).stderr,/Schema drift/);
  const changedSource=f.save("alter canonical inputs");
  f.begin(changedSource,changed);
  assert.equal(f.run().status,0,"only an independent base exposes a coordinated rewrite");
  assert.match(f.run(frozen).stderr,/cannot be edited/);
  rmSync(join(f.cwd,lock));
  assert.match(f.run(frozen).stderr,/cannot be edited or removed/);
  Object.entries(initial).forEach(([path,value])=>f.write(path,value));
  f.begin();
  f.write(`${dir}/later.sql`,"-- new\n");
  assert.match(f.run(frozen).stderr,/Only the frozen canonical migration/);
});

test("a new lock requires complete fingerprints that agree with the pinned commit",t=>{
  const f=fixture(t);
  f.begin(f.accepted,{[sql]:initial[sql]});
  assert.match(f.run(f.accepted).stderr,/must pin/);
  f.begin(f.accepted,{...initial,[sql]:"-- forged\n"});
  assert.match(f.run(f.accepted).stderr,/does not match the accepted source commit/);
  assert.notEqual(f.run("f".repeat(40)).status,0);
});
