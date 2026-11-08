# ChessCoachPal visual identity

**Status:** Approved primary icon, 2026-11-08. The canonical vector asset is `public/icon/chesscoachpal.svg`; `app/icon.svg` is the identical Next.js favicon. `public/icon/chesscoachpal-maskable.svg` uses the same artwork with an inset foreground for Android adaptive masks.

## Positioning

**ChessCoachPal — your AI-first assistant for chess teaching.**

The product helps *human chess teachers* record lessons, manage students, track learning history and organize teaching. AI/MCP connections are the primary input; the website is a dependable optional editing/viewing interface. We are **not** a chess engine, chess game or autonomous replacement for coaches.

Preferred concise headline: **More time for coaching. Less time on admin.**

Voice: friendly, precise and competent; never childish, robotic, glittery, or overpromising. Do not claim unverified ChatGPT/Claude client compatibility, full MCP parity, launch readiness, or unresolved pricing/limits.

## Approved symbol

A recognizable ivory chess **knight as teacher**, facing a smaller **pawn as pupil**, standing over an **open book**. A teal arc conveys guidance and continuity; restrained gold edging evokes the value of teaching. Use the approved lightweight corrected vector asset, not the earlier rook/chat icon, headset variations, or a substituted generic knight.

- Master: `public/icon/chesscoachpal.svg`
- Next icon: `app/icon.svg` (keep byte-identical to master)
- PWA maskable: `public/icon/chesscoachpal-maskable.svg` (full-bleed midnight backdrop, composition inset within adaptive safe region)
- Generated favicon and app PNGs: `public/icon/favicon.ico`, `public/icon/chesscoachpal-{16,32,48,64,128,180,192,256,512,1024}.png`, plus maskable `192`/`512` PNGs.
- Apple touch icon uses the 180px PNG; Android PWA manifest includes 192px and 512px primary and maskable PNGs.
- Rebuild all raster assets after editing the master: `python -m pip install cairosvg pillow && python scripts/export-brand-icons.py`. The source SVG, not individual PNGs, is authoritative.
- Do not recolor individual logo elements independently of the website palette.
- Preserve the full symbol on dark backgrounds and keep enough clear space around it; avoid clipping the ear, pawn, book point, or outer border.

## Shared palette

| Token | Hex | Application |
| --- | --- | --- |
| Midnight background | `#0B1322` | Website default / logo outer field |
| Deep navy surface | `#0D1829` | Cards, navigation and logo interior |
| Deep teal surface | `#11293A` | Elevated panels |
| Ivory text / figure | `#F8F2E8` | Dark-mode foreground and chess figure family |
| Guide teal | `#23B7AB` | Primary highlights, links and icon arc |
| Teal highlight | `#50DDCD` | Focus and highlights |
| Deep teal | `#0A6F69` | Teal shadow and light-mode text accents |
| Book gold | `#E6B447` | Sparse premium accents; not default button color |

The master logo has **gradients** with tonal steps from these families, not a single flat color for each part. Dark mode uses the above palette by default on public pages and in the teacher UI. The teacher UI has an explicit opt-in light theme with an ivory base; it retains the recognizable navy/teal/gold identity.

Core UI token definitions live in `app/globals.css`; PWA theme and background values live in `lib/pwa.ts`. Keep these and the SVG asset in sync. On the dark interface, text-heavy controls should prioritize accessible contrast, and the gold accent should remain restrained.

## Typography

Headings: Nunito. Body and functional UI: Inter. Favor ample spacing, readable data, and an efficient information hierarchy over ornament.

## Product messaging guardrails

Speak about lessons, teaching, students, progress and materials in chess-coach terminology. Do not make generic education or family/household administration the brand's defining category. Preserve privacy-sensitive student data and avoid speculative claims about AI-generated evaluations.

ChessCoachPal original code is **source-visible proprietary** with required MIT and other third-party notices; it must not be described generally as fully MIT-licensed or fully open-source.
