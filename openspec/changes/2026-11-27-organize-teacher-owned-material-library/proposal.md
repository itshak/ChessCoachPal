# Change: teacher-owned material library constructor

**Status:** Proposed for review; no implementation, schema or release authorization.
**Priority:** Proposed P1, coordinated with the Materials workspace redesign.
**Schema authority:** Unexpected post-freeze requirement. ADR-0019 requires a separately reviewed schema change-control ADR before any physical change. No independent migration, freeze-lock edit or live cutover.

## Why
A coach's materials are a reusable personal library, not a prescribed curriculum. The existing typed catalog has native game, puzzle, drill, study chapter and external link kinds; material relations represent provenance and prerequisites, not organization. The current schema has flat chess_skill_categories used for student observations, not nested material collections or material membership. Coaches organize resources by topics, levels, courses, workplaces or their own methodology; mandatory chess categories would constrain them.

## Proposed outcome
- Teacher-owned nested collections, with a blank library available by default. Create, rename, reorder, move, archive and restore; no vendor-imposed root categories, names or fixed depth from a pedagogical perspective (technical safety bounds reviewed separately).
- One canonical material can appear in multiple collections without copying it. Materials with no active membership remain discoverable in All materials and a derived Uncategorized view.
- Optional localized, editable starter structures (chess fundamentals, levels, course structure); preview, customize, select or skip. Explicit application copies only collection structure, not fake materials, assessments or history. No forced onboarding, automatic template updates or vendor lock-in.
- Optional categorization suggestions from existing teacher collections and source metadata. Do not silently create a hierarchy, move existing materials, apply a template or infer mastery. A precise explicit teacher request to place a material in an existing collection may be executed through normal authorized safeguards; ambiguous matches require clarification. Suggestions alone never write.
- Keep the Materials library separate from connected Lichess browsing. Existing verified import, publication, permissions, stale-source and independent teaching-evidence contracts remain authoritative.
- Web and MCP have the same domain capabilities, shared typed schemas and owner-scoped services, with compact path-aware search, bounded batch preview/commit and independent read-back.

## Non-goals
No fixed curriculum, automatic mastery assessment, duplicated material records, mandatory tags, changes to provider defaults, provider writes triggered by organization, workplace-as-tenant design, or commercial entitlement decisions. No change to the frozen schema or production deployment at proposal time.

## Dependencies and acceptance
Coordinate with the coach UI redesign, typed material/evidence and Lichess workflows, multilingual support and ADR-0003/0007 parity. Source inventory and post-freeze ADR review precede any schema work. Only after the schema authority is explicitly approved may implementation proceed; the sole final pre-v1 cutover remains separately authorized under ADR-0017. Verify synthetic fresh baseline, independent restores, tenant isolation, bounded search and concurrency, browser and delegated MCP parity, responsive and localized library UX. Final real client checks remain a separate release gate.

## Review package
See [schema review and proposed ADR](schema-review.md), [exact proposed MCP contracts](mcp-contracts.md) and [acceptance matrix](acceptance.md). Product concept approved; physical amendment and implementation remain blocked. PR #223 is a divergent historical activation draft; main already includes settlement routine and ADR-0037 lock. Recheck actual accepted base with designated schema owner before any candidate.
