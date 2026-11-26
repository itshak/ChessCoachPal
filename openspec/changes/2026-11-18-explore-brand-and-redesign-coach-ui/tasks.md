> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


## 0. Audit and research
- [ ] Inventory current app shell, design tokens, fonts, UI dependencies and representative routes; document existing generic UI issues with reproducible screenshots.
- [ ] Validate Base UI, React Aria and Ariakit current licensing, release/maintenance health, framework compatibility and accessibility feature coverage; cite sources.
- [ ] Define synthetic identical coach fixtures, evaluation criteria, preview access and non-production isolation.

## 1. Design laboratory — required before redesign
- [x] Build working component comparison for Base UI, React Aria and Ariakit: dialogs, menus, combobox/search, forms, keyboard commands and validation. Extended to Ark UI, Radix UI + cmdk and Headless UI; all six common browser workflows passed in [CI run 45909026150](https://github.com/itshak/ChessCoachPal/actions/runs/45909026150).
- [x] Build at least six tokenized palette candidates including Slate & Periwinkle, Graphite & Sage, Ink & Parchment and three genuinely different alternatives. Thirteen palettes including baseline; candidate normal-text contrast and secondary-token switching verified. User selected Graphite, Iris & Champagne and Ark UI for continued design review; no final logo/layout or rollout approval.
- [ ] Build compact professional, editorial teaching desk and command-first hybrid layout variants; avoid same-card recoloring.
- [ ] Build functional synthetic Today, Students/profile and Lesson prep/close scenarios; provide side-by-side baseline comparisons.
- [ ] Support interactive palette, foundation, typography and density switches with dark/light, desktop/mobile, Hebrew RTL and English/Russian stress tests.
- [ ] Run keyboard, screen-reader/focus, WCAG contrast, responsive, RTL, performance and component integration checks.
- [ ] Include the existing rich knight-teacher/pupil/open-book logo in realistic branded preview pages, retaining original and palette-recolored versions alongside relational and typographic/abstract alternatives; explicitly exclude generic standalone chess-piece finalists.
- [ ] Publish screenshots, preview and comparison rubric, including logo comparisons; obtain explicit user selection or revision requests. **STOP here until approved.**

## 2. Approved brand system
- [ ] Compare retained rich knight-teacher/pupil/open-book identity (including recoloring in the selected palette), refined relational concept and typographic/abstract concept; do not preselect a winner or replace the current mark by default.
- [ ] Test header, marketing, avatar, app-icon and favicon optical-size variants (16/24/32/64 px) in monochrome and approved colors; document distinctiveness and storytelling before user approval.
- [ ] Select licensed typography with suitable Hebrew/Russian glyphs and build complete semantic tokens, light/dark states and accessible color roles.
- [ ] Document logo, voice, iconography, spacing, navigation, data density and component standards; align marketing and product identity.

## 3. Staged product rollout
- [ ] Implement approved shell/workplace context, global navigation, search and contextual actions behind a safe preview/rollout mechanism.
- [ ] Apply approved components to Today, student directory/profile, lesson prep/close; then schedules, reports, contacts, workplaces, billing and settings.
- [ ] Preserve domain services, security, privacy, history and existing functionality; add matching MCP operations for any new website business behavior.
- [ ] Run visual regression, keyboard, contrast, RTL, responsive and full authenticated browser/MCP parity checks (93 scenarios, zero teacher-route gaps).
- [ ] Record CI and merged commit evidence in docs/STATUS.md and archive change only after implementation acceptance.

## Non-goal guardrail
- [ ] Verify no production redesign, schema change, deployment or confidential strategy publication was performed merely by creating this OpenSpec proposal.

> Brand refinement decision (2026-11-27): user approved same-color chess pieces (Pearl #F1F2F8 in dark, Graphite #1C1D23 in light), Champagne book and unchanged traced knight/curved pawn geometry for Mentor & pupil and Compact coaching mark. Optical framing and final asset review remain open; do not treat this as approval of the full design-lab gate or production rollout.
