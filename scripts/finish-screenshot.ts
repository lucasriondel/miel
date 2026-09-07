#!/usr/bin/env bun
/**
 * Turns a raw browser capture into one of the two files the README and the
 * landing page show: downscaled to 1800px wide, corners rounded, re-encoded as
 * lossy WebP with an alpha channel.
 *
 *   bun run scripts/finish-screenshot.ts <capture.png> docs/miel-light.webp
 *
 * The three numbers are what the rest of the repo already assumes, so they are
 * defaults rather than arguments:
 *
 * - **1800 wide.** `packages/landing-page/scripts/encode-assets.ts` re-encodes
 *   these to 1520 for the hero, and calls that a downscale; a narrower source
 *   would make it an upscale. `styles.ts` also pins the hero frame's
 *   `aspect-ratio` to 1800/1209, so a capture at a different shape than the
 *   current pair changes a number there too.
 * - **24px radius**, which is the frame's 0.9rem at the scale the shot is
 *   captured, so the corners the reader sees are the app's own.
 * - **quality 82**, the lowest that showed no artefacts on the inbox list's
 *   1px rules.
 *
 * Needs `ffmpeg` (rounding, since ImageMagick is not installed here) and
 * `cwebp` (the encode): `brew install ffmpeg webp`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/** The width every consumer of these files assumes. See the module comment. */
export const TARGET_WIDTH = 1800;
/** Corner radius in pixels, at TARGET_WIDTH — the app frame's own 0.9rem. */
export const CORNER_RADIUS = 24;
/** cwebp quality. Lossy, but with alpha kept for the rounded corners. */
export const QUALITY = 82;

/**
 * The rounded-corner mask, as an ffmpeg expression.
 *
 * `geq` computes the alpha channel per pixel: fully opaque everywhere except
 * within a corner's radius square, where the pixel is kept only if it is inside
 * the quarter circle. Written as one expression because ffmpeg has no rounded
 * -rect primitive, and the alternative — generating a mask PNG — needs the
 * image library this machine does not have.
 */
export function roundedAlphaExpression(radius: number): string {
  // Distance from the pixel to the centre of the nearest corner circle, but
  // only where the pixel is actually in a corner square; elsewhere `min` picks
  // the coordinate itself, which is >= radius, so the pixel stays opaque.
  const dx = `(min(X,W-1-X))`;
  const dy = `(min(Y,H-1-Y))`;
  const inCorner = `lt(${dx},${radius})*lt(${dy},${radius})`;
  const dist = `hypot(${radius}-${dx},${radius}-${dy})`;
  return `if(${inCorner}, if(lte(${dist},${radius}),255,0), 255)`;
}

export function finish(
  sourcePng: string,
  outWebp: string,
  {
    width = TARGET_WIDTH,
    radius = CORNER_RADIUS,
    quality = QUALITY,
  }: { width?: number; radius?: number; quality?: number } = {},
): void {
  if (!existsSync(sourcePng)) throw new Error(`no such capture: ${sourcePng}`);

  const dir = mkdtempSync(join(tmpdir(), "miel-shot-"));
  const rounded = join(dir, "rounded.png");
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        sourcePng,
        "-vf",
        // Scale first, so the radius is applied at the final size and reads the
        // same as the app's own corner rather than being scaled with the image.
        `scale=${width}:-1:flags=lanczos,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${roundedAlphaExpression(radius)}'`,
        rounded,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );

    execFileSync(
      "cwebp",
      ["-quiet", "-q", String(quality), "-alpha_q", "100", rounded, "-o", outWebp],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const kb = Math.round(statSync(outWebp).size / 1024);
  console.log(`${basename(outWebp)}: ${width}px wide, q${quality}, ${kb} KB`);
}

if (import.meta.main) {
  const [source, out] = process.argv.slice(2);
  if (!source || !out) {
    console.error(
      "usage: bun run scripts/finish-screenshot.ts <capture.png> <out.webp>",
    );
    process.exit(1);
  }
  finish(source, out);
}
