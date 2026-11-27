# ChessCoachPal visual identity

**Status:** Approved direction, 2026-11-27. Production adoption under draft PR #248; visual and CI acceptance pending.

## Positioning

**ChessCoachPal — your AI-first assistant for chess teaching.**

The product helps *human chess teachers* record lessons, manage students, track learning history and organize teaching. AI/MCP connections are the primary input; the website is a dependable optional editing/viewing interface. We are **not** a chess engine, chess game or autonomous replacement for coaches.

Preferred concise headline: **More time for coaching. Less time on admin.**

Voice: friendly, precise and competent; never childish, robotic, glittery, or overpromising. Do not claim unverified ChatGPT/Claude client compatibility, full MCP parity, launch readiness, or unresolved pricing/limits.

## Approved symbol

Mentor & Pupil is the primary logo; Compact Coaching Mark is the small-size variant. The exact approved knight contour, curved pawn foot and book geometry come from the approved prototype. Both pieces are Pearl (#F1F2F8) in dark and Graphite (#1C1D23) in light, with a Champagne book. The wordmark keeps ChessCoach unified and highlights Pal in Iris.

- Theme-specific masters: public/icon/chesscoachpal-{mentor,compact}-{dark,light}.svg.
- Canonical favicon and PWA: public/icon/chesscoachpal.svg (compact dark), byte-identical app/icon.svg; maskable variant has an inset composition.
- Generated favicon.ico and all existing PNG sizes use the new artwork. Rebuild with scripts/export-brand-icons.py; do not edit raster derivatives.
- Optical framing uses the approved compact-large study (viewBox 155 125 940 940); inspect at 16, 32, 180 and 512 px before acceptance.

## Shared palette

| Role | Dark | Light |
| --- | --- | --- |
| Background | #1C1D23 | #F4F2F9 |
| Surface | #272932 | #FFFFFF |
| Foreground | #F1F2F8 | #292638 |
| Muted | #BBC0D0 | #5D586F |
| Iris primary | #B3A9E8 | #58418F |
| Champagne accent | #CDB58D | #76572E |
| Interactive border | #7A7E91 | #868098 |

Semantic success, warning and error roles are distinct from the accent; use on-primary and equivalent on-colors for solid buttons. See app/globals.css and lib/design-tokens.test.ts. Dark default; teacher light theme retained. PWA metadata follows the existing theme cookie.

## Typography

Inter with Cyrillic and Noto Sans Hebrew fallback; logical alignment and bidirectional user content. Existing font-nunito references resolve to Inter during migration.

## Product messaging guardrails

Speak about lessons, teaching, students, progress and materials in chess-coach terminology. Do not make generic education or family/household administration the brand's defining category. Preserve privacy-sensitive student data and avoid speculative claims about AI-generated evaluations.

ChessCoachPal original code is **source-visible proprietary** with required MIT and other third-party notices; it must not be described generally as fully MIT-licensed or fully open-source.
