# Stage 1 design laboratory — initial scaffold, not design approval

OpenSpec: [redesign coach UI](../openspec/changes/2026-11-18-explore-brand-and-redesign-coach-ui/proposal.md).

## Source audit at ac7e46f
- `app/globals.css`: midnight/ivory/teal/gold, Nunito display and Inter body; teacher-only light token overrides.
- `app/layout.tsx`: Next.js root locale and direction, Inter Latin/Cyrillic and Noto Sans Hebrew.
- `components/teacher/TeacherNav.tsx`: top nav, mobile/menu variants, account and workplace controls.
- `app/(teacher)/dashboard/page.tsx` and `students/page.tsx`: summary cards, roster cards, standalone add form; candidates should improve scanning and preserve canonical service behavior.
- Existing rich mark: `public/icon/chesscoachpal.svg`. Preserve original artwork.
- `package.json`: Next 16.4.1, React 19.2.3, Tailwind 4, Floating UI; no Base UI, React Aria Components or Ariakit installed.

## Preview
Run `CHESSCOACHPAL_DESIGN_LAB=1 npm run dev` in a normal configured development checkout and open `/design-lab`. The route returns not found by default; do not enable on the live service. Synthetic fixtures only; local React state, no domain API calls or database writes from the lab. Existing root layout/proxy still apply. No production CSS, dependencies, logo, auth or schema edits.

Initial implementation includes six candidate dark/light palettes plus the existing palette reference, three layout hypotheses, density, typography, English/Hebrew/Russian interface stress controls, original logo, local Today/roster/lesson-close flows, native command dialog, and a fixture/contrast unit test. The native controls are a shared comparison reference, NOT a fourth shortlisted library or a substitute for the required three working library implementations. Preview copy is isolated and translated in its fixture module; production translation catalogs remain untouched.

## Remaining acceptance
- Verify current candidate versions, licensing, maintenance, framework compatibility, actual bundle cost and accessibility. Install all three on the isolated branch and implement equivalent interactions including real searchable picker, dropdown/menu, command and dialog with each; compare on identical fixtures.
- Complete palette semantic states, focus and control boundary contrast, typography/font licensing, localized synthetic scenario content, and more distinct workflow design. Current logo only: add genuine palette recolors, relational and typographic alternatives, tiny-size/monochrome and marketing mockups.
- Capture reproducible desktop/mobile/RTL screenshots of baseline and candidates, run browser keyboard/focus/screen-reader checks, contrast and performance evaluation; verify local draft behaviors.
- Publish side-by-side comparisons with a preview, evidence and evaluation matrix, request explicit user decisions. Do not select a winner or roll out before approval.
- Existing OpenSpec tasks remain open. No deployment, migration, production rollout or archival authorized.
