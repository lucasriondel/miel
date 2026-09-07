import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";
import { resolve } from "node:path";
import { ICONS, LUCIDE_LICENSE, type IconName } from "./icons";
import { FEATURES } from "./site";

const packageRoot = resolve(import.meta.dirname, "../..");

describe("the inlined Lucide glyphs", () => {
  test("every feature names a glyph that exists", () => {
    for (const feature of FEATURES.items) {
      expect(ICONS[feature.icon as IconName]).toBeDefined();
      expect(ICONS[feature.icon as IconName].length).toBeGreaterThan(0);
    }
  });

  test("no two features share a glyph, which would make the row read as a repeat", () => {
    const used = FEATURES.items.map((feature) => feature.icon);
    expect(new Set(used).size).toBe(used.length);
  });

  test("carries no glyph nothing renders", () => {
    const used = new Set<string>(FEATURES.items.map((feature) => feature.icon));
    expect(Object.keys(ICONS).filter((name) => !used.has(name))).toEqual([]);
  });

  /* Lucide draws on a 24x24 grid and the component hardcodes that viewBox, so a
     shape transcribed from a different grid would render off-centre or clipped.
     Coordinates are checked loosely — within the box, allowing the slight
     overshoot Lucide's own curves use.

     The leading `\.?` in the number pattern is load-bearing: SVG path data omits
     the separator between a decimal and the next number, so `1.414.586` is two
     coordinates, and a pattern demanding a digit before the point reads the
     second as `586` and fails a glyph that is perfectly fine. */
  test("every coordinate sits on Lucide's 24x24 grid", () => {
    for (const shapes of Object.values(ICONS)) {
      for (const shape of shapes) {
        const numbers =
          shape.kind === "path"
            ? [...shape.d.matchAll(/-?(?:\d+(?:\.\d+)?|\.\d+)/g)].map((m) => Number(m[0]))
            : Object.values(shape)
                .filter((value) => typeof value === "string")
                .map(Number)
                .filter((value) => !Number.isNaN(value));
        for (const value of numbers) {
          expect(value).toBeGreaterThanOrEqual(-24);
          expect(value).toBeLessThanOrEqual(48);
        }
      }
    }
  });
});

describe("the ISC licence the copies travel under", () => {
  /* The glyphs are copied rather than imported, which the ISC licence permits
     only while its notice accompanies the copy. That makes this an obligation
     rather than a courtesy: the notice has to be *rendered*, so it is asserted
     here and again in the prerendered output, not merely present as a string. */
  test("names Lucide, the licence and the copyright holders", () => {
    expect(LUCIDE_LICENSE).toMatch(/Lucide/);
    expect(LUCIDE_LICENSE).toMatch(/ISC/);
    expect(LUCIDE_LICENSE).toMatch(/Lucide Contributors/);
    expect(LUCIDE_LICENSE).toMatch(/Cole Bemis/);
  });

  test("is rendered by the footer, so every page carries it", () => {
    const footer = readFileSync(resolve(packageRoot, "src/components/SiteFooter.tsx"), "utf8");
    expect(footer).toContain("LUCIDE_LICENSE");
  });
});

describe("self-containment", () => {
  /* The page ships no JavaScript, so an icon *component* library cannot be a
     dependency of it — the glyphs are path data instead, drawn by one inline
     <svg>. Importing the package would put a runtime in a document with none
     and break the build's self-containment scan. The web app is where
     lucide-react belongs; `packageContract.test.ts` guards the manifest, this
     guards the source. */
  test("no source file imports an icon package", () => {
    const sources = [...new Glob("src/**/*.{ts,tsx}").scanSync(packageRoot)];
    const offenders = sources.filter((file) =>
      /from\s+"lucide/.test(readFileSync(resolve(packageRoot, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
