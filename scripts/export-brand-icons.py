#!/usr/bin/env python3
"""Export web/PWA icon assets from the approved, lightweight ChessCoachPal SVG.

Run: python -m pip install cairosvg pillow
     python scripts/export-brand-icons.py

The SVG is the source of truth; never hand-edit generated PNGs.
"""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "public" / "icon"
SVG = ICON_DIR / "chesscoachpal.svg"
MASKABLE = ICON_DIR / "chesscoachpal-maskable.svg"


def render_master(source: Path) -> Image.Image:
    data = cairosvg.svg2png(url=str(source), output_width=1254, output_height=1254)
    return Image.open(BytesIO(data)).convert("RGBA")


def write_sizes(master: Image.Image, prefix: str, sizes: tuple[int, ...]) -> None:
    for size in sizes:
        out = ICON_DIR / f"{prefix}-{size}.png"
        master.resize((size, size), Image.Resampling.LANCZOS).save(
            out, format="PNG", optimize=True
        )
        print(f"generated {out.relative_to(ROOT)}")


def main() -> None:
    primary = render_master(SVG)
    write_sizes(primary, "chesscoachpal", (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024))
    primary.save(
        ICON_DIR / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print("generated public/icon/favicon.ico")
    maskable = render_master(MASKABLE)
    write_sizes(maskable, "chesscoachpal-maskable", (192, 512))


if __name__ == "__main__":
    main()
