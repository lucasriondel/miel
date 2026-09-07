import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { APP_ICON, SCREENSHOT_DARK, SCREENSHOT_LIGHT } from "./assets";
import { ENCODES, encode } from "../../scripts/encode-assets";

/**
 * `assets.ts` is generated from three images in the repository. Nothing stops
 * someone editing a source image and shipping a page that still shows the old
 * one, so the check here is the regeneration itself: encode each source again
 * and compare. `cwebp` is deterministic for a given input and set of flags, so
 * a match means the checked-in bytes are the ones the current sources produce.
 *
 * It needs `cwebp` on the PATH. Where that is absent — some CI images — the
 * comparison is skipped rather than failed, but everything that can be checked
 * without it still is: the URIs are well-formed, non-empty, and the sources
 * they name still exist.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../../../..");

const EMBEDDED: Record<string, string> = {
  APP_ICON,
  SCREENSHOT_LIGHT,
  SCREENSHOT_DARK,
};

function hasCwebp(): boolean {
  return Bun.which("cwebp") !== null;
}

describe("embedded assets", () => {
  test("the generator and the module describe the same three images", () => {
    const generated: string[] = ENCODES.map((entry) => entry.name);
    expect(generated.toSorted()).toEqual(Object.keys(EMBEDDED).toSorted());
  });

  for (const { name, source } of ENCODES) {
    describe(name, () => {
      test("is a webp data URI with a payload", () => {
        const uri = EMBEDDED[name]!;
        expect(uri.startsWith("data:image/webp;base64,")).toBe(true);
        expect(uri.length).toBeGreaterThan(1000);
      });

      test("names a source that is still in the repository", () => {
        expect(existsSync(join(REPO_ROOT, source))).toBe(true);
      });
    });
  }

  test.skipIf(!hasCwebp())(
    "matches what the current source images encode to — regenerate with `bun run encode-assets`",
    () => {
      for (const { name, source, width, quality } of ENCODES) {
        expect(encode(join(REPO_ROOT, source), width, quality)).toBe(EMBEDDED[name]!);
      }
    },
  );
});

/**
 * The page may reference nothing the browser has to fetch. The build enforces
 * that on the built HTML; this is the same property asserted on the input, so a
 * mistake here fails in `bun test` rather than at the end of a build.
 */
describe("self-containment", () => {
  test("every embedded image is inline, not a URL to somewhere", () => {
    for (const [name, uri] of Object.entries(EMBEDDED)) {
      expect(uri, name).toMatch(/^data:/);
      expect(uri, name).not.toMatch(/^https?:/);
    }
  });

  test("the page's whole image payload stays within a sane budget", () => {
    const total = Object.values(EMBEDDED).reduce((sum, uri) => sum + uri.length, 0);
    // ~170 KB today, most of it the two screenshots at 2x their display width.
    // The ceiling catches a re-encode at the sources' full 1800px, which would
    // put it near 240 KB — enough to notice on the wire for no visible gain,
    // since nothing renders them that large.
    //
    // It was 165 KB while the screenshots were captured at an 1800px CSS
    // viewport, which fit so much UI into the frame that the text was too small
    // to read. They are now shot at ~1370px CSS instead: fewer, larger elements,
    // which is more legible but carries more detail per pixel and so encodes
    // larger at the same quality. The budget moved to fit the readable pair —
    // if this fails again, check `encode-assets.ts` is still at 1520px before
    // assuming the ceiling is simply too low.
    expect(total).toBeLessThan(180_000);
  });
});
