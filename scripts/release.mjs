#!/usr/bin/env node
// ChessCoachPal release tooling: prepare, validate, notes.
// Preparing changes local files, but never creates a tag or release.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const HEADER_RE = /^## \[(Unreleased|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\](?: - (\d{4}-\d{2}-\d{2}))?[ \t]*$/gm;

export function validVersion(version) {
  return typeof version === "string" && VERSION_RE.test(version);
}

export function compareVersions(a, b) {
  const pa = VERSION_RE.exec(a), pb = VERSION_RE.exec(b);
  if (!pa || !pb) throw new Error("Invalid semantic version");
  for (let i = 1; i <= 3; i++) {
    const difference = Number(pa[i]) - Number(pb[i]);
    if (difference) return Math.sign(difference);
  }
  if (!pa[4] && pb[4]) return 1;
  if (pa[4] && !pb[4]) return -1;
  if (!pa[4] && !pb[4]) return 0;
  const aa = pa[4].split("."), bb = pb[4].split(".");
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if (aa[i] === undefined) return -1;
    if (bb[i] === undefined) return 1;
    if (aa[i] === bb[i]) continue;
    const an = /^\d+$/.test(aa[i]), bn = /^\d+$/.test(bb[i]);
    if (an && bn) return Math.sign(Number(aa[i]) - Number(bb[i]));
    if (an !== bn) return an ? -1 : 1;
    return aa[i] < bb[i] ? -1 : 1;
  }
  return 0;
}

export function section(markdown, version) {
  const headers = [...markdown.matchAll(HEADER_RE)];
  const found = headers.findIndex((header) => header[1] === version);
  if (found < 0) throw new Error("Missing CHANGELOG.md section [" + version + "]");
  const start = headers[found].index + headers[found][0].length;
  const end = found + 1 < headers.length ? headers[found + 1].index : markdown.length;
  return markdown.slice(start, end).trim();
}

export function hasChanges(notes) {
  return notes.split("\n").some((line) => /^\s*-\s+\S/.test(line));
}

export function firstReleaseReady(markdown) {
  const heading = "## v0.1.0: first functional release gate";
  const start = markdown.indexOf(heading);
  if (start < 0) return false;
  const following = markdown.indexOf("\n## ", start + heading.length);
  const block = markdown.slice(start, following >= 0 ? following : markdown.length);
  const checks = [...block.matchAll(/^- \[([ xX])\] /gm)];
  return checks.length >= 6 && checks.every((match) => match[1].toLowerCase() === "x");
}

export function prepareChangelog(markdown, version, date) {
  if (markdown.includes("## [" + version + "]")) throw new Error("Version already in CHANGELOG");
  if (!hasChanges(section(markdown, "Unreleased"))) {
    throw new Error("Add change-list bullets under Unreleased before preparing a version");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Expected ISO date");
  const heading = "## [Unreleased]";
  if (!markdown.includes(heading)) throw new Error("Missing Unreleased heading");
  return markdown.replace(heading,
    heading + "\n\n_Changes for the next release go here._\n\n## [" + version + "] - " + date);
}

function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeJson(path, object) { writeFileSync(path, JSON.stringify(object, null, 2) + "\n"); }

function assertPackageVersions(version) {
  const pkg = readJson("package.json"), lock = readJson("package-lock.json");
  if (pkg.version !== version || lock.version !== version ||
      lock.packages?.[""]?.version !== version) {
    throw new Error("package.json and package-lock.json root versions must match " + version);
  }
}

export function main(command, version) {
  if (!["prepare", "validate", "notes"].includes(command) ||
      !validVersion(version) || version === "0.0.0") {
    throw new Error("Usage: node scripts/release.mjs <prepare|validate|notes> <X.Y.Z[-prerelease]>");
  }
  if (command === "prepare") {
    const pkg = readJson("package.json"), lock = readJson("package-lock.json");
    const current = pkg.version;
    if (!validVersion(current) || compareVersions(version, current) <= 0) {
      throw new Error("New version must be greater than current package version");
    }
    if (lock.version !== current || lock.packages?.[""]?.version !== current) {
      throw new Error("Lockfile root version differs from package.json");
    }
    const next = prepareChangelog(readFileSync("CHANGELOG.md", "utf8"),
      version, new Date().toISOString().slice(0, 10));
    pkg.version = version;
    lock.version = version;
    lock.packages[""].version = version;
    writeJson("package.json", pkg);
    writeJson("package-lock.json", lock);
    writeFileSync("CHANGELOG.md", next);
    process.stdout.write("Prepared v" + version +
      ". Review changelog, commit, and merge to main to publish after checks.\n");
    return;
  }
  assertPackageVersions(version);
  if (version === "0.1.0" && !firstReleaseReady(readFileSync("docs/RELEASING.md", "utf8"))) {
    throw new Error("v0.1.0 is blocked until every first-functional-release checklist item is checked");
  }
  const markdown = readFileSync("CHANGELOG.md", "utf8");
  const notes = section(markdown, version);
  const heading = "## [" + version + "] - ";
  const entry = markdown.split("\n").find((line) => line.startsWith(heading));
  if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.slice(heading.length)) ||
      !hasChanges(notes)) {
    throw new Error("Release " + version + " requires a dated, nonempty CHANGELOG section");
  }
  if (command === "notes") {
    process.stdout.write("ChessCoachPal v" + version + "\n\n" + notes + "\n\n" +
      (version.startsWith("0.") ?
        "**Pre-1.0 warning:** No compatibility with CogNote or older ChessCoachPal versions. " +
        "Use a fresh installation or explicitly reset disposable development data. " +
        "Back up any real data before destructive operations.\n\n" : "") +
      "GitHub provides source code archives (ZIP and tar.gz) for the release tag.\n");
  } else {
    process.stdout.write("Validated release metadata for v" + version + "\n");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main(process.argv[2], process.argv[3]); }
  catch (error) {
    process.stderr.write("Release error: " + error.message + "\n");
    process.exitCode = 1;
  }
}
