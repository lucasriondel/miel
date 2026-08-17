#!/usr/bin/env bun
/**
 * Regenerates `src/content/assets.ts` — the app icon and the two inbox
 * screenshots as base64 `data:` URIs.
 *
 * The page must reference no file the browser would fetch, so the only way to
 * show the *real* images (rather than a redrawn approximation) is to carry
 * their bytes in the document. They are downscaled and re-encoded on the way
 * in: the sources are 1800px and 500px, several times the size they render at,
 * and every byte here lands in every visitor's HTML.
 *
 *   bun run encode-assets
 *
 * Needs `cwebp` (brew install webp). Run it after changing any source image;
 * `assets.test.ts` fails if the checked-in output stops matching the sources.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const OUT = resolve(import.meta.dirname, "../src/content/assets.ts");

/**
 * Each embedded image, with the encode that produced it.
 *
 * Widths are 2x the largest CSS size the page renders each image at, because a
 * retina display asks for two device pixels per CSS pixel and anything less is
 * upscaled — which looks like a blurry screenshot, not like a smaller one.
 * Getting this wrong is easy, so the arithmetic is written down:
 *
 * - The screenshot's widest case is the hero at its 82rem ceiling, where the
 *   image track is 6/10 of (82rem - 3rem gap) = 758 CSS px. 2x is ~1516, hence
 *   1520. (Its source is 1800 wide, so this is a real downscale, not an upscale.)
 * - The icon renders at 1.9em of 17px = ~33 CSS px; 96 covers 2x with room.
 *
 * If the hero's track ratio or its max width changes, this width has to change
 * with it. Quality is then the lowest that showed no artefacts at that size.
 */
export const ENCODES = [
  {
    name: "APP_ICON",
    source: "packages/web/public/miel.webp",
    width: 96,
    quality: 85,
    doc: "The app icon — `packages/web/public/miel.webp`, the bee the README opens with.",
  },
  {
    name: "SCREENSHOT_LIGHT",
    source: "docs/miel-light.webp",
    width: 1520,
    quality: 68,
    doc: "The inbox screenshot from the README, light scheme — `docs/miel-light.webp`.",
  },
  {
    name: "SCREENSHOT_DARK",
    source: "docs/miel-dark.webp",
    width: 1520,
    quality: 68,
    doc: "The same screenshot in the dark scheme — `docs/miel-dark.webp`.",
  },
] as const;

/** Downscale and re-encode one source image, returning its `data:` URI. */
export function encode(sourceAbsolute: string, width: number, quality: number): string {
  const dir = mkdtempSync(join(tmpdir(), "miel-encode-"));
  const out = join(dir, "out.webp");
  try {
    execFileSync("cwebp", [
      "-quiet",
      "-q",
      String(quality),
      "-resize",
      String(width),
      "0",
      sourceAbsolute,
      "-o",
      out,
    ]);
    return `data:image/webp;base64,${readFileSync(out).toString("base64")}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): void {
  const parts = ENCODES.map(({ name, source, width, quality, doc }) => {
    const uri = encode(join(REPO_ROOT, source), width, quality);
    const kb = Math.round(uri.length / 1024);
    return (
      `/**\n * ${doc}\n *\n` +
      ` * Re-encoded from the source at ${width}px wide, quality ${quality} — ${kb} KB as text.\n */\n` +
      `export const ${name} =\n  "${uri}";\n`
    );
  });

  writeFileSync(
    OUT,
    "/**\n" +
      " * The real app images, inlined as `data:` URIs.\n" +
      " *\n" +
      " * GENERATED FILE — do not edit by hand. Regenerate with:\n" +
      " *\n" +
      " *   bun run encode-assets\n" +
      " *\n" +
      " * These are the actual files the README shows, not a redrawing of them:\n" +
      " * `packages/web/public/miel.webp` and `docs/miel-{light,dark}.webp`,\n" +
      " * downscaled to the size the page renders them at. They are carried in the\n" +
      " * document because a prerendered page here may reference nothing the browser\n" +
      " * would have to fetch. See `scripts/encode-assets.ts` for the encode, and\n" +
      " * `src/content/assets.test.ts` for the check that they still match the sources.\n" +
      " */\n\n" +
      parts.join("\n"),
  );

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  console.log(`encode-assets: wrote ${OUT} (${Math.round(total / 1024)} KB)`);
}

if (import.meta.main) main();
