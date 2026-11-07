// Read-only review of retrievable GitHub Actions log/trace artifacts.
// Never echo credential values or publish unredacted content. GitHub's
// expired/cached/unreachable artifacts cannot be verified by this scanner.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!token || !repository) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");
const base = "https://api.github.com/repos/" + repository;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const headers = {
  Authorization: "Bearer " + token,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "ChessCoachPal-audit",
};
async function api(path, asBytes = false) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(base + path, { headers, redirect: "follow" });
    if (response.status === 404 || response.status === 410) return null;
    if ([429, 502, 503, 504].includes(response.status)) {
      await sleep(400 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error("GitHub API HTTP " + response.status + " for " + path);
    return asBytes ? Buffer.from(await response.arrayBuffer()) : response.json();
  }
  throw new Error("GitHub API retry budget exceeded for " + path);
}

const rules = [
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["github_pat", /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}/g],
  ["aws_key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["stripe_live", /\bsk_live_[A-Za-z0-9]{20,}\b/g],
  ["openai_key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b/g],
  ["slack_key", /\bxox[baprs]-[A-Za-z0-9-]{25,}\b/g],
  ["database_password", /\bpostgres(?:ql)?:\/\/[^:@/\s]+:(?!\$\{[^}\n]+\}@)[^@/\s]{12,}@[^\s"'<>]+/g],
];
const report = {
  timestamp: new Date().toISOString(),
  repository, scope: "Accessible Actions run logs and unexpired artifact ZIPs; no raw values retained",
  runsListed: 0, logArchivesScanned: 0, artifactsScanned: 0,
  textFilesScanned: 0, nestedArchivesScanned: 0, unavailableLogs: 0,
  expiredArtifacts: 0, largeOrUnreadableEntries: 0,
  highConfidenceFindings: [], manualReviewCandidates: [],
  limitations: "Does not verify expired/deleted artifacts, inaccessible GH cached SHAs, forks, third-party hosted logs, binary screenshots or unidentifiable real-person PII.",
};
const seen = new Set();
function finding(collection, run, source, rule) {
  const key = collection + "|" + run + "|" + source + "|" + rule;
  if (!seen.has(key)) {
    seen.add(key);
    collection.push({ run, source, rule });
  }
}
function scanText(bytes, run, source) {
  if (bytes.length > 16 * 1024 * 1024) {
    report.largeOrUnreadableEntries++;
    return;
  }
  if (bytes.subarray(0, Math.min(bytes.length, 2048)).includes(0)) return;
  report.textFilesScanned++;
  const data = bytes.toString("utf8");
  for (const [rule, re] of rules) {
    re.lastIndex = 0;
    if (re.test(data)) finding(report.highConfidenceFindings, run, source, rule);
  }
  const endpoint = /\bhttps?:\/\/[A-Za-z0-9.-]+\.(?:vercel\.app|ngrok-free\.app|supabase\.co|netlify\.app|railway\.app)\b/gi;
  const urls = data.match(endpoint) || [];
  if (urls.some((url) => !/\/\/example\./i.test(url))) {
    finding(report.manualReviewCandidates, run, source, "possibly_private_host");
  }
  const emails = data.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || [];
  if (emails.some((email) => !/@(?:example\.(?:com|org|net)|localhost|invalid|test)$/i.test(email))) {
    finding(report.manualReviewCandidates, run, source, "non_fixture_email");
  }
}
const tmp = mkdtempSync(join(tmpdir(), "ccp-actions-audit-"));
let zipSequence = 0;
function scanZip(bytes, run, source, depth = 0) {
  if (bytes.length > 50 * 1024 * 1024) {
    report.largeOrUnreadableEntries++;
    return;
  }
  const file = join(tmp, String(zipSequence++) + ".zip");
  writeFileSync(file, bytes);
  let entries;
  try {
    entries = execFileSync("unzip", ["-Z", "-1", file], { maxBuffer: 2 * 1024 * 1024 })
      .toString("utf8").split(/\r?\n/).filter(Boolean);
  } catch {
    report.largeOrUnreadableEntries++;
    return;
  }
  for (const entry of entries) {
    if (entry.endsWith("/")) continue;
    let body;
    try {
      body = execFileSync("unzip", ["-p", file, entry], {
        maxBuffer: 16 * 1024 * 1024, timeout: 10_000,
      });
    } catch {
      report.largeOrUnreadableEntries++;
      continue;
    }
    if (/\.zip$/i.test(entry) && depth < 1) {
      report.nestedArchivesScanned++;
      scanZip(body, run, source + ":nested", depth + 1);
    } else if (/\.zip$/i.test(entry)) {
      report.largeOrUnreadableEntries++;
    } else {
      scanText(body, run, source);
    }
  }
}

let runs = [];
for (let page = 1; page <= 100; page++) {
  const data = await api("/actions/runs?per_page=100&page=" + page);
  const batch = data?.workflow_runs || [];
  runs.push(...batch);
  if (batch.length < 100) break;
}
report.runsListed = runs.length;
let cursor = 0;
async function worker() {
  while (cursor < runs.length) {
    const run = runs[cursor++];
    if (!run || run.status !== "completed") continue;
    try {
      const logs = await api("/actions/runs/" + run.id + "/logs", true);
      if (logs) {
        scanZip(logs, run.id, "actions-log");
        report.logArchivesScanned++;
      } else {
        report.unavailableLogs++;
      }
      const listing = await api("/actions/runs/" + run.id + "/artifacts?per_page=100");
      for (const artifact of listing?.artifacts || []) {
        if (artifact.expired) { report.expiredArtifacts++; continue; }
        const data = await api("/actions/artifacts/" + artifact.id + "/zip", true);
        if (!data) { report.expiredArtifacts++; continue; }
        scanZip(data, run.id, "actions-artifact");
        report.artifactsScanned++;
      }
    } catch (error) {
      report.manualReviewCandidates.push({
        run: run.id, source: "actions-api", rule: "unavailable_or_error",
        detail: String(error).slice(0, 140),
      });
    }
  }
}
try {
  await Promise.all(Array.from({ length: 4 }, () => worker()));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
writeFileSync("m4-actions-audit.json", JSON.stringify(report, null, 2) + "\n");
console.log("M4 Actions scan: " + report.runsListed + " runs; " +
  report.logArchivesScanned + " log archives, " + report.artifactsScanned +
  " artifact ZIPs, " + report.textFilesScanned + " text entries; " +
  report.highConfidenceFindings.length + " high-confidence findings; values redacted.");
if (report.logArchivesScanned === 0 || report.highConfidenceFindings.length > 0) {
  console.error("Actions audit cannot approve these accessible logs; read the redacted artifact.");
  process.exitCode = 1;
}
