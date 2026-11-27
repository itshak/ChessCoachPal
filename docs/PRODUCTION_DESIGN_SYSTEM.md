# Production design system — Agent 1 contract (draft)

Approved prototype: experiments/design-lab/src/prototype.jsx, prototype.css, brand.jsx. Production uses no prototype fixtures. Ark UI 5.37.0 is pinned; use its headless Dialog, Menu, Combobox, Field and Checkbox packages, with the application LocaleProvider. Keep existing shared exports and domain services intact.

## Shared API

- `components/ui/workspace-shell.tsx`: WorkspaceShell({utilities, children}) is mounted once by the authenticated teacher layout. Do not wrap pages again. Utilities slot retains the existing workplace selection, notification, account, language, theme and sign-out behavior. The scoped compatibility adapter hides the old header's route links only; do not change TeacherNav markup without coordinating replacement of this adapter.
- `components/ui/workspace-layout.tsx`: MasterDetail({master, detail, masterLabel, detailLabel, detailOpen, onDetailOpenChange, mobileDetail, onBack, backLabel, showDetailLabel, hideDetailLabel}). Caller owns selection, URL, fetching, editing, mobile detail navigation and restoring focus/scroll on back. Both panes are rendered but the inactive one is display:none. At 800px and above the inspector is optional; below 800px the explicit mobileDetail state chooses one screen. Do not place mutation logic inside the layout. Inspector is readable prose, history, relevant metrics and contextual actions, not a raw field dump.
- FocusedPage({children,className?}): max 720px, logical start. PageHeading({title,actions?,hideTitleOnMobile?}): opt in only for redundant tab titles; h1 remains accessible. Do not hide form or record headings.
- RecordTitle({title,subtitle?,actions?}), RecordSection({title,children}), MetricGrid + RecordMetric({label,value,context?}), RecordProse({children}), Timeline + TimelineEntry({title,when,children?}), StatusLabel({children,tone?}), ContextActions({children}), RecordRow({title,description?,meta?,selected?,onSelect}). Linked records use existing Next Link and semantic Iris text; never embed actions inside RecordRow. Supply localized labels and format dates/numbers with current locale.
- BrandMark({size,alt?,className?,variant?}) and Wordmark({className?}). Both theme variants render in SSR-safe markup; CSS chooses visible asset. Existing Button and Card exports remain.

## Implementation decisions and coordination

Desktop >=1280: persistent logical-start navigation; tablet 800–1279: horizontal navigation; mobile <800: five 26px icon tabs with safe area. Main content scrolls normally. Search is an Ark modal that filters existing navigation destinations, not a record index; Ctrl/Cmd+K opens it. Capture leads to the existing coaching route until Agent 2 supplies the dedicated capture workflow. All existing route destinations remain available via navigation or More. Settings/account use start alignment. Agents 2/3 own adoption of master-detail, mobile headings and detail routing in their pages; Agent 4 owns materials hierarchy. Do not introduce business operations via presentation components.

## Review gate

- Asset generation run: https://github.com/itshak/ChessCoachPal/actions/runs/46006954074 (success, dependency resolution and raster generation only).
- Semantic contrast unit tests and authenticated shell E2E added; required CI and screenshot inspection must pass on final integrated head.
- Verify existing navigation selectors/onboarding, workplace persistence, account sign-out, theme, locale, push, PWA, and existing parity tests. Manual optical inspection, keyboard/screen-reader checks and Hebrew/Russian stress at actual widths remain required; no claim of acceptance until observed.
- No schema, shared service contract, MCP tools, deploy, merge or archive changes. No new business operation; parity guard remains intact.
