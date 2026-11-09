// Structural audit for signed-off parity scenarios. Never replaces runtime E2E.
const evidencePattern = /(e2e\/[a-zA-Z0-9_./-]+\.spec\.ts)#(PARITY-[a-zA-Z0-9_-]+)/g;

/** Every checked scenario cites a unique, named website↔MCP test. */
export function validateCheckedParityRow(row, ordinal, exists, read) {
  const errors = [];
  const references = [...row.matchAll(evidencePattern)];
  if (!references.length)
    return ["Checked parity scenario " + ordinal + " needs e2e/file.spec.ts#PARITY-id evidence"];
  for (const [, path, id] of references) {
    if (path.includes("..") || !path.startsWith("e2e/") || !exists(path)) {
      errors.push("Checked parity scenario " + ordinal + " has missing or unsafe file " + path);
      continue;
    }
    const lines = read(path).split("\n");
    const testIndex = lines.findIndex(line =>
      line.includes('test("PARITY:' + id) ||
      line.includes("test('PARITY:" + id) ||
      line.includes('it("PARITY:' + id) ||
      line.includes("it('PARITY:" + id));
    if (testIndex < 0) {
      errors.push("Checked parity scenario " + ordinal + " has no test titled PARITY:" + id);
      continue;
    }
    const next = lines.findIndex((line, i) => i > testIndex && /^\s*(test|it)\s*\(/.test(line));
    const body = lines.slice(testIndex, next < 0 ? testIndex + 250 : next).join("\n");
    const checks = [
      [/tools\/call|\bcall\s*\(|\bcallTool\s*\(/, "MCP invocation"],
      [/page\.request\.|\brequest\.(get|post|put|patch|delete)\s*\(\s*["']\/api\//, "website API request"],
      [/\bexpect\s*\(/, "assertion"],
    ];
    for (const [pattern, name] of checks) {
      if (!pattern.test(body)) errors.push("Checked parity scenario " + ordinal +
        " named test PARITY:" + id + " lacks " + name);
    }
  }
  return errors;
}

/** One executable scenario may not silently sign off multiple distinct cases.
 * Each checked acceptance row needs independent, reviewable behavior evidence.
 */
export function validateUniqueCheckedParityReferences(rows) {
  const seen = new Map();
  const errors = [];
  for (const [index, row] of rows.entries()) {
    if (!/^\\|\\s*-\\s*\\[[xX]\\]/.test(row)) continue;
    for (const [, file, id] of row.matchAll(evidencePattern)) {
      const key = file + "#" + id;
      if (seen.has(key)) {
        errors.push("Checked scenario " + (index + 1) + " reuses evidence " +
          key + " from scenario " + seen.get(key) +
          "; add an individually named E2E parity test");
      } else {
        seen.set(key, index + 1);
      }
    }
  }
  return errors;
}
