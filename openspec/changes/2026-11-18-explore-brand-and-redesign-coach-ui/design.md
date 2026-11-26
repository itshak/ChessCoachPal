> **2026-11-21 schema-ownership handoff:** All anticipated physical persistence in this design is owned by the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** under ADR-0019. This design remains a downstream feature contract. Superseded old freeze references below are historical; no independently staged feature DDL or live database change is authorized.

# Design: original brand and UI architecture

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


## Design-lab structure
Create isolated /design-lab preview or a separately deployed preview with synthetic fixtures, no production writes. Component foundation switcher: Base UI / React Aria / Ariakit. Palette switcher: six or more token sets. Layout switcher: compact rows / editorial workbench / command-first hybrid. Provide deterministic scenario fixtures so differences are visible and comparable.

## Candidate foundation research and decision rubric
- **Base UI:** unstyled accessible React primitives, high control over styling and composition; test combobox, menus, dialogs and focus handling.
- **React Aria Components:** broad accessibility/i18n support, localized calendars/forms and RTL; test complexity, styling ergonomics and package cost.
- **Ariakit:** niche accessible headless React toolkit with strong command/menu/combobox/dialog patterns; test composability, keyboard workflow, active maintenance, compatibility and cost of building full data-entry components.
Do not select by popularity, niche status or default appearance. Verify actual installed versions, licensing, release cadence and ecosystem at implementation time. Prefer one primary primitive foundation; exceptions require documented reason. Do not assume a library supplies a complete branded design system.

## Design directions and tokens
Baseline ranked hypotheses:
1. Slate & Periwinkle: bg #222326, surface #2C2D32, foreground #F4F5F8, accent #A6A7D8.
2. Graphite & Sage: bg #1E2020, surface #292C2B, foreground #F1F0EA, accent #9BB6A3.
3. Ink & Parchment: bg #211F1D, surface #302C28, foreground #F1E8D9, accent #C3A982.

Explore at least three additional, visibly distinct families; starting directions (not final hex values): (4) Charcoal & Oxblood/Clay, (5) Mineral Blue-Gray & Soft Copper, (6) Deep Olive & Lilac Stone. Designers should derive and tune complete semantic tokens on actual screens, not mechanically recolor the baseline. Evaluate light counterparts, focus/hover/disabled/error/success, text/number hierarchy, charts, borders and logo use. Reject inaccessible combinations.

## Logo comparison protocol
- **Candidate A — retained current identity:** rich knight-teacher, small pupil pawn and open book. Keep the original as baseline and render palette-recolored variants once candidate colors are available; the final palette is not selected yet. Preserve the distinctive teaching narrative rather than treating detail as a defect.
- **Candidate B — relational refinement:** redesigned knight-teacher/pupil interaction; test meaningful variations, not generic knight clipart. Candidate remains undecided.
- **Candidate C — typographic/abstract mark:** evaluate whether a more minimal mark communicates chess coaching and is recognizable without losing the human teaching relationship. Candidate remains undecided.
- **Rejected:** standalone simple chess piece or generic chess knight silhouette. Do not include as a finalist or quietly reintroduce it.
- Test all candidates at header, landing page, avatar, app icon and 16/24/32/64 px favicon scales, both monochrome and in every shortlisted palette. Allow an optical-size small icon derived from the rich primary logo if needed; do not replace the primary mark merely because favicon reduction is hard.
- Compare visual distinctiveness, meaning, legibility, memorability, color compatibility, and coherence with typography. Record explicit user selection; none is preapproved.

## Interface design hypotheses
- **Compact professional workspace:** dense, scannable rows, precise separators, contextual actions, persistent sidebar and clear keyboard focus.
- **Editorial teaching desk:** typographic hierarchy, generous but purposeful whitespace, reduced card chrome, reading-oriented lesson evidence.
- **Command-first hybrid:** compact overview plus detail inspector, command palette, rapid capture and shortcuts without hiding essential functions.

## Representative scenarios
A. Today: three lessons across two workplaces, one group, one incomplete attendance, one overdue homework item, one unresolved billing item.
B. Students: active/archived status, aliases, strength, ratings with source, multiple contacts, cross-workplace enrollment, filter/search, timeline.
C. Lesson: shared lesson objective, participant attendance, verified material, private notes, draft shareable summary and next action. Test keyboard completion, errors and save confirmations.

## Constraints
- Dark-first but first-class light mode, high contrast and low-chrome layout.
- WCAG 2.2 AA target for contrast and keyboard use; Hebrew RTL and English/Russian stress tests; desktop and narrow/mobile widths.
- Synthetic data only in preview. No unapproved user data, secrets or confidential strategy excerpts.
- No unverified claims about Linear's private internal technology; cite public documentation for inspiration, not implementation assertions.
- Brand decisions must include icon/favicon at tiny sizes, wordmark, marketing site and in-app UI.
- Shared domain services and ADR-0003 parity are unaffected by visual experimentation.

## Decision record before rollout
Publish comparison matrix, screenshots, accessible preview links, component and dependency inventory, proposed palette/token source, font/license and localization review, user feedback and explicit chosen direction. Only then turn approved results into staged implementation tasks.

## Layout refinement after user review (2026-11-27)
The initial three-column prototype was insufficient: list selection must update the inspector without navigation, central rows should expose only scan-critical properties, inspector should contain distinct actionable evidence, and opening the full editor must be explicit. Evaluate a minimal split workspace and a time-oriented daily agenda alongside the corrected hybrid and original compact/editorial studies. Keep the brand minimal, use restrained iris selection and champagne learning accents; no ornamental dashboard cards. Linear public redesign principles and Things Today agenda are inspiration; coaching semantics come from the existing market research and daily workflow design. This remains isolated lab review, not rollout authorization.
