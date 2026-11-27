# Tasks
## 0. Review and schema gate
- [ ] Obtain product review of collection constructor, templates, membership and safe archive/restore semantics.
- [ ] Inventory current catalog, skill categories, relations, provider and evidence services, parity registry and schema lock; decide dedicated collection model and technical bounds.
- [ ] Obtain separately reviewed post-freeze ADR/change-control approval before any physical change; no baseline/manifest/lock edit beforehand.
- [ ] Implement only approved canonical schema/type/manifest/lock change under designated schema authority; independent synthetic fresh boot, structural comparison, RLS/composite FK/grants and restore evidence.
## 1. Shared services
- [ ] Implement bounded tree/search, path resolution, stable IDs, sibling ordering, rename/move/revision, cycle/concurrency prevention.
- [ ] Implement unique material membership, multi-collection placement, all/uncategorized queries, subtree archive/restore with impact preview and safe conflicts.
- [ ] Implement optional localized editable starter structures, preview/apply, skip, atomic replay, no duplicates or fake records.
- [ ] Implement non-writing categorization suggestions, explicit existing-target placement, ambiguous/missing-path clarification, bounded bulk preview/commit; never block lesson recording.
- [ ] Implement export/import of organization and stable links, preserve evidence, test reimport and existing uncategorized materials.
## 2. UX and parity
- [ ] Implement Library/Lichess views, tree and search, breadcrumbs, accessible collection controls and material detail presentation; preserve all existing provider features.
- [ ] Implement desktop/tablet/mobile, keyboard, RTL, English/Hebrew/Russian, empty/large/deep library states and no drag-only controls.
- [ ] Add shared input schemas and services, ccp_* registry/dispatcher/tools/list, permissions and real authenticated browser/delegated MCP E2E for every new operation and field; bounded response tests.
## 3. Acceptance
- [ ] Test duplicate labels in distinct branches, ambiguous names, root/child moves, concurrent cycles, stale/replayed request, cross-tenant probes, membership dedup, archives/restores, template conflicts, imports and no implicit teaching/provider writes.
- [ ] Run OpenSpec strict validation, typecheck, unit, integration, E2E/parity, security, Compose, backup/restore, pre1 final-cutover audit and exact-head required checks.
- [ ] Verify merged evidence and update canonical specs/status; archive only when accepted. Real ChatGPT/Claude and final live transition remain separate operator gates. No implementation or release implied by proposal.

## 0a. Agent 4 documentation review (before gate)
- [x] Read proposal and inspect pinned main baseline, manifest, lock, typed contract excerpts, relevant services, ADR-0020 and settlement comparison; document findings and recommended shape.
- [x] Draft proposed change-control decision, contracts and acceptance plan in review package (not a permit).
- [ ] Run actual OpenSpec strict validation and record exact candidate evidence; do not claim pass from document inspection.
- [ ] Operator approve proposed domain/physical approach and designate single schema owner; reconcile stale #223 before candidate work.
- [ ] Review exact successor separately under ADR-0020; no protected files modified by this proposal.
