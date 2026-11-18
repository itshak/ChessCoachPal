# Change: evaluate and redesign ChessCoachPal's brand and professional coach interface

> **ADR-0017 final-cutover override (2026-11-18):** No backward compatibility or legacy dual-writes before v1. The final deliverable uses the clean canonical baseline and current website/MCP contracts. All planned features deploy with **one final** live migration **or** verified clean rebuild/reimport at the operator's choice; no per-feature production migration. Existing data handling is a deliberate one-time import/mapping decision, not an obligation to retain obsolete Family/Studio/guardian APIs or old portal tokens. Security, tenant isolation and explicit new grants remain required.


**Status:** Proposed; discovery and prototype approval required before production redesign.
**Priority:** P1, with Stage 1 design laboratory first.
**Dependencies:** Coordinate with 2026-11-18-improve-daily-coach-workflows, 2026-11-18-add-workplace-context-and-retire-studio, 2026-11-18-extend-professional-coach-workflows and contacts/compensation proposals. ADR-0003 MCP/web parity is binding.

## Why
The existing dark navy/teal/gold palette, Nunito/Inter hierarchy, large cards, generic controls and stacked forms do not yet communicate the intended calm, dependable, precise, human chess-teaching product. Recoloring the same generic dashboard is not a redesign. The coach needs fast action-oriented daily navigation, compact student data, context-preserving lessons and clear private-vs-shared information. The product is AI/MCP-first with a fully capable secondary web UI.

## Outcome
Choose an original, accessible, recognizable ChessCoachPal brand and a minimal, professional web design system through real working comparisons, then apply the approved system consistently across teacher journeys and marketing. Do not assume Linear's proprietary internal components can be installed; study its principles (density, hierarchy, subtle surfaces, keyboard navigation, coherent token system) without copying its visual identity.

## Stage 1 — mandatory isolated design laboratory and approval gate
- Build a temporary route or separate preview environment with synthetic, non-sensitive realistic coaching data; do not change production design, records, auth or finance.
- Compare **Base UI, React Aria Components and Ariakit** as equal, fully working candidates. Implement equivalent meaningful interactions in each (dialog, dropdown, searchable student picker, keyboard command/search, lesson-close form, selection, accessible validation); document strengths, gaps, bundle/dependency costs, maintainability and integration with existing Next.js stack.
- Evaluate distinct UI architectures, not only libraries: (A) compact Linear-like table/row-oriented workspace with restrained dividers, (B) editorial typographic workbench with very few boxes, (C) hybrid command-first teaching workspace with contextual inspector and keyboard flows. The three variants should look materially different.
- Create at least **six** original palette candidates, each fully tokenized and tested on realistic pages, not isolated swatches. Include previous ranked hypotheses: Slate & Periwinkle (#222326 bg / #2C2D32 surface / #F4F5F8 text / #A6A7D8 accent), Graphite & Sage (#1E2020 / #292C2B / #F1F0EA / #9BB6A3), Ink & Parchment (#211F1D / #302C28 / #F1E8D9 / #C3A982), plus at least three materially different new directions such as muted oxblood/clay on charcoal, mineral blue-gray with muted copper, and deep olive/stone with soft lilac. New directions are exploration hypotheses, not approved brand colors.
- Include adjustable typography, spacing/density, radii, separators, navigation, elevation, focus states and color tokens; show dark and light modes and contrast measurements. Explore more serious type families than Nunito; license and multilingual glyph coverage must be checked.
- Prototype at least three real workflows using the same synthetic dataset: Today/next lesson action queue, compact searchable student directory + profile/timeline, and lesson preparation/closing with group attendance and private/shareable note boundaries. Include workplace context and pending exceptions. Compare desktop, mobile and Hebrew RTL (plus English/Russian text stress cases).
- Make the preview easy to access and compare side by side with current website. Include screenshots and a concise evaluation matrix covering distinctiveness, usability, density, keyboard accessibility, contrast, RTL, mobile, performance and maintenance.
- **Approval gate:** user chooses or requests revisions to palette, component foundation, typography, navigation, logo direction and core page treatment. No rollout, wholesale component replacement or final design-system decision before approval.

## Stage 2 — brand identity after selection
- Define original logomark refinements: simplified knight-teacher/pupil relationship at 16/24/32/64 px; compare one-color and selected brand-color treatments, avoiding generic knight clipart or complex book/trim details that collapse at favicon scale.
- Define brand promise, tone, typography, iconography, color roles, surface behavior, light/dark modes and consistent website/marketing/logo assets; preserve dependability, teaching continuity, professional ease and evidence transparency.
- Check WCAG 2.2 AA contrast and focus, color-blind distinguishability, font licensing, Hebrew/Russian support and responsive identity.
- Produce versioned design tokens and component usage guidelines; no leaked private strategy document in public repo.

## Stage 3 — staged product UI adoption
- Establish a cohesive shell with workplace selector, efficient navigation, search and contextual actions; avoid oversized cards and permanent edit forms.
- Redesign Today, Students, Student Detail, Lesson Prep/Close first, then schedules, materials, reports, contacts, workplaces, billing and settings as those features land.
- Preserve domain behavior, auth/privacy, stable data semantics, route availability and feature parity. Shared services remain the source of truth; every new teacher website business action must ship matching MCP tool, registry and authenticated parity tests in the same PR.
- Add visual regression, accessibility, RTL, keyboard, responsive and functional tests; compare old/new workflows before rollout. Use feature flags where helpful, with no unsupported compatibility promises before 1.0.

## Non-goals
No production redesign before design-lab approval; no requirement to copy Linear, install its proprietary components, buy a commercial theme, rewrite domain logic, alter financial rules or change production data. Do not confuse visual prototypes with functioning production workflows.

## Acceptance
The user can inspect working Base UI, React Aria and Ariakit implementations, six or more clearly different palette options, three distinct interface architectures, dark/light, mobile and Hebrew RTL on identical realistic coaching scenarios; evaluate and request changes before a final library is chosen. Approved designs preserve accessible keyboard interactions and verified MCP parity for every teacher business action.
