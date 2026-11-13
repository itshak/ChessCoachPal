/**
 * Fails closed when a teacher-facing API route imports a new business operation
 * that is not also wired into the authenticated MCP tool catalogue. This
 * complements per-action OAuth E2E (including the multiplexed legacy gateway).
 *
 * Direct structural import parity cannot prove field semantics, so it is
 * deliberately combined with the full browser/MCP E2E acceptance matrix.
 */
const infrastructural = new Set([
  "@/lib/server/api-schemas",
  "@/lib/server/http",
  "@/lib/server/agent-oauth-core",
]);
const browserOnlyExport = new Set([
  "@/lib/server/teacher-transfer-service#teacherExport",
]);
export function namedBusinessImports(source) {
  const modules = new Map();
  const pattern = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](@\/lib\/[^"']+)["']/g;
  for (const [,names,module] of source.matchAll(pattern)) {
    if (!module.startsWith("@/lib/server/") || infrastructural.has(module)) continue;
    const set = modules.get(module) ?? new Set();
    for (const original of names.split(",")) {
      const symbol = original.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (symbol) set.add(symbol);
    }
    modules.set(module,set);
  }
  return modules;
}
const callable = symbol => /^[a-z][a-zA-Z0-9_]*$/.test(symbol) &&
  !/(Schema|Error|Input|Response|Filters|Filter|Data|Params|Context|Result|Output|ErrorCode)$/.test(symbol);

export function teacherDomainParityErrors(path,websiteSource,toolSource) {
  const web = namedBusinessImports(websiteSource);
  const agent = namedBusinessImports(toolSource);
  const shared = [...web.keys()].filter(m=>agent.has(m));
  const errors = [];
  if (shared.length===0)
    errors.push(path+": teacher route lacks a shared imported domain-service module in the MCP catalogue");
  // The legacy gateway has 39 exact action/discriminator parity checks;
  // the old gateway must not be confused with one-to-one function imports.
  if (path==="app/api/agent/v1/route.ts") return errors;
  for (const [module,functions] of web) {
    for (const name of functions) {
      if (!callable(name)) continue;
      const id=module+"#"+name;
      // Full backups may contain portal credentials. The MCP path intentionally
      // exposes only teacherSafeExport, never raw teacherExport. This is an
      // explicit privacy exception, not a missing teacher business operation.
      if (path==="app/api/settings/export/route.ts" && browserOnlyExport.has(id))
        continue;
      if (!agent.get(module)?.has(name))
        errors.push(path+": website domain operation "+id+" lacks matching MCP import (add a tool and E2E, or review a secure exception)");
    }
  }
  return errors;
}
