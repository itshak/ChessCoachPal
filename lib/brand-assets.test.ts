import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PWA } from "./pwa";

const asset = (path: string) => readFileSync(new URL(path, import.meta.url));
const primarySvg = asset("../public/icon/chesscoachpal.svg").toString("utf8");
const nextSvg = asset("../app/icon.svg").toString("utf8");
const maskableSvg = asset("../public/icon/chesscoachpal-maskable.svg").toString("utf8");
const css = asset("../app/globals.css").toString("utf8");

describe("approved ChessCoachPal identity", () => {
  it("uses exactly the approved source SVG for the app and public icon", () => {
    expect(nextSvg).toBe(primarySvg);
    expect(primarySvg).toBe(asset("../public/icon/chesscoachpal-compact-dark.svg").toString("utf8"));
    expect(primarySvg).toContain('viewBox="155 125 940 940"');
    expect(primarySvg).not.toContain("rook and conversation");
  });

  it("has a distinct foreground inset for PWA mask-safe rendering", () => {
    expect(maskableSvg).toContain("ChessCoachPal maskable icon");
    expect(maskableSvg).toContain("translate(188 188) scale(0.7)");
    expect(maskableSvg).toBe(asset("../public/icon/chesscoachpal-compact-maskable.svg").toString("utf8"));
  });

  it("keeps the website and the logo in one approved brand palette", () => {
    for (const hue of ["#1C1D23", "#F1F2F8", "#CDB58D"]) {
      expect(primarySvg).toContain(hue);
      expect(css).toContain(hue);
    }
    expect(css).toContain("--color-background: #1C1D23");
    expect(css).toContain('--color-surface: #272932');
    expect(css).toContain('[data-teacher-theme="light"]');
    expect(PWA.backgroundColor).toBe("#1C1D23");
    expect(PWA.themeColor).toBe("#272932");
  });

  it("preserves approved knight, pawn foot and book contours across all theme variants", () => {
    const reference = asset("../experiments/design-lab/src/logo-source.svg").toString("utf8");
    const prototype = asset("../experiments/design-lab/src/brand.jsx").toString("utf8");
    const knight = reference.match(/<clipPath id="horseClip"><path d="([^"]+)"/)?.[1];
    expect(knight).toBeTruthy();
    for (const variant of ["mentor", "compact"]) {
      for (const theme of ["dark", "light"]) {
        const svg = asset(`../public/icon/chesscoachpal-${variant}-${theme}.svg`).toString("utf8");
        expect(svg.match(/data-part="knight" d="([^"]+)"/)?.[1]).toBe(knight);
        for (const part of ["pawn-foot", "book"]) {
          const contour = svg.match(new RegExp('data-part="' + part + '" d="([^"]+)"'))?.[1];
          expect(contour).toBeTruthy();
          expect(prototype).toContain(contour);
        }
        const piece = theme === "dark" ? "#F1F2F8" : "#1C1D23";
        expect(svg).toContain(`data-part="pawn" fill="${piece}"`);
        expect(svg).toContain(`transform="translate(0 15)" fill="${piece}"`);
      }
    }
  });

  it("ships valid generated raster icons in the required display sizes", () => {
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024];
    for (const size of sizes) {
      const data = asset(`../public/icon/chesscoachpal-${size}.png`);
      expect(data.subarray(0, 8).equals(pngSignature)).toBe(true);
      expect(data.readUInt32BE(16)).toBe(size);
      expect(data.readUInt32BE(20)).toBe(size);
    }
    for (const size of [192, 512]) {
      const data = asset(`../public/icon/chesscoachpal-maskable-${size}.png`);
      expect(data.subarray(0, 8).equals(pngSignature)).toBe(true);
      expect(data.readUInt32BE(16)).toBe(size);
      expect(data.readUInt32BE(20)).toBe(size);
    }
    expect(Array.from(asset("../public/icon/favicon.ico").subarray(0, 4))).toEqual([0, 0, 1, 0]);
  });
});
