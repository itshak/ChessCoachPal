import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const script=fileURLToPath(new URL("./schema-freeze-lock.mjs",import.meta.url));
const dir="supabase/migrations";
const sql=`${dir}/20261107000000_chesscoachpal_baseline.sql`;
const manifest="scripts/schema-transition-manifest.json";
const lock="scripts/schema-freeze-lock.json";
const approval="scripts/approved-schema-freeze-successor.json";
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
  return {cwd,write,save,run,accepted,begin,git};
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

test("schema rotation requires the exact independently reviewed successor on base",t=>{
  const f=fixture(t);
  const readLock=()=>readFileSync(join(f.cwd,lock));
  f.begin();
  const oldBytes=readLock();
  const frozen=f.save("accepted lock");
  f.git("checkout","-qb","feature",frozen);
  const changed={ [sql]:"-- intentional successor SQL\n", [manifest]:'{"mode":"next"}\n' };
  Object.entries(changed).forEach(([file,value])=>f.write(file,value));
  const newSource=f.save("exact successor source");
  f.begin(newSource,changed);
  const nextBytes=readLock();
  const permit=JSON.stringify({version:1,adr:"ADR-0020",
    previousLockSha256:digest(oldBytes),successorLockSha256:digest(nextBytes)});
  f.write(approval,permit);
  const candidate=f.save("successor lock plus attempted self-approval");
  assert.match(f.run(frozen).stderr,/cannot be edited/,"same-PR permit cannot authorize itself");

  f.git("checkout","-qb","review",frozen);
  f.write(approval,permit);
  const approved=f.save("independently approve exact digests with old baseline intact");
  assert.equal(f.run(frozen).status,0,"approval is preparation only");

  f.git("checkout","-q","feature");
  assert.match(f.run(approved).stderr,/retain the review base/);
  f.git("merge","--no-ff","-qm","bring in reviewed approval",approved);
  const result=f.run(approved);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/separately reviewed base approval \(ADR-0020\)/);

  f.write(lock,Buffer.concat([nextBytes,Buffer.from("\n")]));
  assert.match(f.run(approved).stderr,/does not match the exact reviewed successor/);
  f.write(lock,nextBytes);
  f.write(sql,"-- unrelated edit\n");
  assert.match(f.run(approved).stderr,/Schema drift/);
  f.write(sql,changed[sql]);
  const successor=f.git("rev-parse","HEAD");
  Object.entries(initial).forEach(([file,value])=>f.write(file,value));
  f.write(lock,oldBytes);
  assert.match(f.run(successor).stderr,/does not match the exact reviewed successor/,"approval cannot be reused to revert");
  assert.notEqual(candidate,approved);
});
