import test from "node:test";
import assert from "node:assert/strict";
import {
  validVersion, compareVersions, section, hasChanges, prepareChangelog, firstReleaseReady,
} from "./release.mjs";

const sample = "# Changelog\n\n## [Unreleased]\n\n### Added\n- A workflow\n- Chess sessions\n\n## [0.0.9] - 2026-11-01\n\n- Earlier work\n";

test("accepts semantic versions and rejects invalid values", () => {
  assert.equal(validVersion("0.1.0"), true);
  assert.equal(validVersion("0.2.0-beta.1"), true);
  assert.equal(validVersion("v0.1.0"), false);
  assert.equal(validVersion("0.01.0"), false);
  assert.equal(validVersion("0.1.0/../../other"), false);
});

test("orders stable and prerelease versions", () => {
  assert.equal(compareVersions("0.1.0", "0.0.0"), 1);
  assert.equal(compareVersions("0.1.0-rc.2", "0.1.0-rc.10"), -1);
  assert.equal(compareVersions("0.1.0", "0.1.0-rc.10"), 1);
  assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
});

test("extracts exact changelog section without older releases", () => {
  assert.match(section(sample, "Unreleased"), /Chess sessions/);
  assert.doesNotMatch(section(sample, "Unreleased"), /Earlier work/);
  assert.equal(section(sample, "0.0.9"), "- Earlier work");
  assert.throws(() => section(sample, "9.9.9"), /Missing/);
});

test("prepares a dated section while preserving the older versions", () => {
  const next = prepareChangelog(sample, "0.1.0", "2026-11-07");
  assert.equal(section(next, "Unreleased"), "_Changes for the next release go here._");
  assert.match(section(next, "0.1.0"), /Chess sessions/);
  assert.equal(section(next, "0.0.9"), "- Earlier work");
  assert.throws(() => prepareChangelog(next, "0.1.0", "2026-11-07"), /already/);
});

test("rejects empty unreleased sections", () => {
  assert.equal(hasChanges("_Changes for the next release go here._"), false);
  assert.equal(hasChanges("### Fixed\n- Issue"), true);
  assert.throws(() => prepareChangelog("# Changelog\n\n## [Unreleased]\n\nNo entries\n",
    "0.1.0", "2026-11-07"), /change-list/);
});

test("v0.1.0 requires every first-functional-release checklist item", () => {
  const prefix = "## v0.1.0: first functional release gate\n\n";
  const six = Array.from({ length: 6 }, (_, i) => "- [x] criterion " + i).join("\n");
  assert.equal(firstReleaseReady(prefix + six), true);
  assert.equal(firstReleaseReady(prefix + six.replace("- [x] criterion 5", "- [ ] criterion 5")), false);
  assert.equal(firstReleaseReady(prefix + "- [x] only one"), false);
  assert.equal(firstReleaseReady("## Other heading\n- [x] criterion"), false);
});
