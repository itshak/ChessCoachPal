#!/usr/bin/env node
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {lstatSync,readFileSync,readdirSync} from "node:fs";

const lockPath = "scripts/schema-freeze-lock.json";
const successorPath = "scripts/approved-schema-freeze-successor.json";
const migrationDir = "supabase/migrations";
const baselineName = "20261107000000_chesscoachpal_baseline.sql";
const lockedPaths = [
  `${migrationDir}/${baselineName}`,
  "scripts/schema-transition-manifest.json",
];

function git(...args) {
  return execFileSync("git",args,{stdio:["ignore","pipe","pipe"],maxBuffer:16*1024*1024});
}

function regularFile(path) {
  if (!lstatSync(path).isFile()) throw new Error(`Expected a regular file: ${path}`);
  return readFileSync(path);
}

function optionalFile(path) {
  try { return regularFile(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function optionalObject(sha,path) {
  // Check the tree first so a missing file is not mistaken for a missing commit,
  // an unreadable object, or a checkout/fetch error.
  return git("ls-tree","-r","--full-tree",sha,"--",path).length
    ? git("show",`${sha}:${path}`) : null;
}

function commit(sha) {
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) throw new Error("Expected a full Git commit SHA");
  if (git("cat-file","-t",sha).toString().trim() !== "commit") throw new Error("Expected a Git commit");
  return sha;
}

function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }

function parseLock(buf) {
  const obj=JSON.parse(buf.toString("utf8"));
  const keys=["version","acceptedSourceCommit","sha256"];
  if (!obj || typeof obj !== "object" || Array.isArray(obj) ||
    obj.version !== 1 || Object.keys(obj).length !== keys.length ||
    keys.some(key=>!Object.hasOwn(obj,key))) throw new Error("Invalid schema freeze lock");
  const hashes=obj.sha256;
  if (!hashes || typeof hashes !== "object" || Array.isArray(hashes) ||
    Object.keys(hashes).length !== lockedPaths.length ||
    lockedPaths.some(path=>!Object.hasOwn(hashes,path) || typeof hashes[path] !== "string" || !/^[0-9a-f]{64}$/.test(hashes[path])))
    throw new Error("Schema freeze lock must pin the baseline and transition manifest");
  commit(obj.acceptedSourceCommit);
  return obj;
}

function requireAncestor(ancestor, descendant, message) {
  try { git("merge-base","--is-ancestor",ancestor,descendant); }
  catch { throw new Error(message); }
}

function authorizeSuccessor(base, previousBytes, currentBytes) {
  // The proposal itself cannot permit its own lock change. Use only the
  // independently merged approval on the checked-out base, never working-tree data.
  const approvalBytes=optionalObject(base,successorPath);
  if (!approvalBytes)
    throw new Error("The accepted base schema freeze lock cannot be edited or removed by an ordinary change");
  const approval=JSON.parse(approvalBytes.toString("utf8"));
  const keys=["version","adr","previousLockSha256","successorLockSha256"];
  if (!approval || typeof approval!=="object" || Array.isArray(approval) ||
      approval.version!==1 || Object.keys(approval).length!==keys.length ||
      keys.some(key=>!Object.hasOwn(approval,key)) ||
      typeof approval.adr!=="string" || !/^ADR-[0-9]{4}$/.test(approval.adr) ||
      ["previousLockSha256","successorLockSha256"].some(k=>
        typeof approval[k]!=="string" || !/^[0-9a-f]{64}$/.test(approval[k])))
    throw new Error("Invalid reviewed schema successor approval on the base");
  if (approval.previousLockSha256!==sha256(previousBytes) ||
      approval.successorLockSha256!==sha256(currentBytes))
    throw new Error("Schema lock does not match the exact reviewed successor on the base");
  const previous=parseLock(previousBytes);
  const next=parseLock(currentBytes);
  requireAncestor(base,"HEAD","Approved schema successor must retain the review base in checkout history");
  requireAncestor(previous.acceptedSourceCommit,next.acceptedSourceCommit,
    "Approved schema successor must retain the previous accepted source in history");
  if (previous.acceptedSourceCommit===next.acceptedSourceCommit)
    throw new Error("Approved schema successor must pin a distinct accepted source");
  console.log(`Schema lock transition matches the separately reviewed base approval (${approval.adr}).`);
}

function main(args) {
  if (args.length !== 0 && !(args.length === 2 && args[0] === "--base"))
    throw new Error("Usage: node scripts/schema-freeze-lock.mjs [--base FULL_GIT_SHA]");
  const base=args.length ? commit(args[1]) : null;
  const old=base ? optionalObject(base,lockPath) : null;
  const current=optionalFile(lockPath);
  if (old && !current) {
    throw new Error("The accepted base schema freeze lock cannot be edited or removed by an ordinary change");
  }
  if (old && !old.equals(current)) authorizeSuccessor(base,old,current);
  if (!current) {
    console.log("No accepted schema freeze lock yet; the post-freeze drift guard is not active.");
    return;
  }
  const lock=parseLock(current);
  requireAncestor(lock.acceptedSourceCommit,"HEAD","Accepted schema source commit must be preserved in checkout history");
  if (!lstatSync(migrationDir).isDirectory()) throw new Error("Expected a regular migration directory");
  const migrations=readdirSync(migrationDir).filter(name=>name.endsWith(".sql"));
  if (migrations.length !== 1 || migrations[0] !== baselineName)
    throw new Error("Only the frozen canonical migration is allowed");
  for (const path of lockedPaths) {
    if (sha256(git("show",`${lock.acceptedSourceCommit}:${path}`)) !== lock.sha256[path])
      throw new Error(`Freeze lock does not match the accepted source commit: ${path}`);
    if (sha256(regularFile(path)) !== lock.sha256[path])
      throw new Error(`Schema drift relative to the accepted freeze: ${path}`);
  }
  console.log("Accepted canonical schema and transition manifest match the freeze lock.");
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`Schema freeze lock: ${error.message}\n`);
  process.exitCode=1;
}
