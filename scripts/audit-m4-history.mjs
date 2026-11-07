// Milestone 4 historic source audit. Scan all reachable refs, not just HEAD.
// No matched secret text ever appears in logs or artifacts. Unsupported
// unreachable GitHub objects/previously downloaded CI logs require separate
// GitHub-side review; this scanner makes no claim to purge those objects.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const git=(args,input)=>execFileSync("git",args,{input,maxBuffer:256*1024*1024});
const refs=git(["for-each-ref","--format=%(refname)"]).toString().trim().split("\n").filter(Boolean);
const raw=git(["rev-list","--objects","--all"]).toString().trim().split("\n");
const objects=new Map();
for(const item of raw){
  const match=/^([a-f0-9]{40,64})(?: (.*))?$/.exec(item);
  if(match && !objects.has(match[1]))objects.set(match[1],match[2]??"");
}
const sizes=git(["cat-file","--batch-check=%(objectname) %(objecttype) %(objectsize)"],
 Array.from(objects.keys()).join("\n")+"\n").toString().trim().split("\n");
const blobShas=[];
for(const row of sizes){const [sha,type,size]=row.split(" ");if(type==="blob"&&Number(size)<2_000_000)blobShas.push(sha);}
const secretMatchers=[
  ["private_key",/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["github_token",/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}/g],
  ["aws_access_key",/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["stripe_live_secret",/\bsk_live_[A-Za-z0-9]{20,}\b/g],
  ["openai_secret",/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b/g],
  ["slack_token",/\bxox[baprs]-[A-Za-z0-9-]{25,}\b/g],
  ["supabase_jwt",/\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*[:=]\s*["']?eyJ[A-Za-z0-9_-]{70,}/g],
  ["embedded_db_password",/\bpostgres(?:ql)?:\/\/[^:@/\s]+:[^@/\s]{12,}@[^\s"'<>]+/g],
];
let scanned=0,skipped=0;const findings=[];const noteworthy=[];
for(let i=0;i<blobShas.length;i+=70){
  const chunk=blobShas.slice(i,i+70);
  const result=git(["cat-file","--batch"],chunk.join("\n")+"\n");
  let offset=0;
  for(const sha of chunk){
    const eol=result.indexOf(10,offset);
    if(eol<0)throw new Error("Truncated git-cat-file batch");
    const header=result.toString("utf8",offset,eol);
    const match=/^[a-f0-9]+ blob (\d+)$/.exec(header);
    if(!match)throw new Error("Unexpected git object header");
    const bytes=Number(match[1]);const data=result.subarray(eol+1,eol+1+bytes);
    offset=eol+2+bytes;
    if(data.includes(0)){skipped++;continue;}
    scanned++;
    const source=data.toString("utf8");
    const path=objects.get(sha)??"";
    if(/(?:^|\/)(?:\.env\.local|\.env\.production|id_rsa|id_ed25519|credentials\.json)$/.test(path)){
      findings.push({rule:"sensitive_filename",sha:sha.slice(0,12),path});
    }
    for(const [rule,regex] of secretMatchers){
      regex.lastIndex=0;if(regex.test(source))findings.push({rule,sha:sha.slice(0,12),path});
    }
    if(/(?:^|\/)(?:private|production|students-real|school-real)[^/]*\.(?:csv|xlsx|json)$/i.test(path))
      noteworthy.push({rule:"manual_dataset_review",sha:sha.slice(0,12),path});
  }
}
const report={createdAt:new Date().toISOString(),refCount:refs.length,refs,
 reachableObjects:objects.size,scannedTextBlobs:scanned,skippedBinaryOrLarge:skipped,
 secretFindingCount:findings.length,findings,manualReviewCandidates:noteworthy,
 limitations:"Reachable Git objects only; deleted refs, unreferenced cached GitHub SHAs, external forks, Actions logs/artifacts and third-party systems require separate review."};
writeFileSync("m4-security-audit.json",JSON.stringify(report,null,2)+"\n");
console.log(`M4 reachable-history scan: ${refs.length} refs, ${scanned} text blobs, ${findings.length} high-confidence findings; individual matches redacted.`);
if(findings.length){console.error("M4 high-confidence exposure candidates found; see restricted audit artifact for paths, rotate and remediate before publication.");process.exitCode=1;}
