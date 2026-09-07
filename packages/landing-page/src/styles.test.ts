import { describe, expect, test } from "bun:test";
import { CSS } from "./styles";

/**
 * The page has no browser in CI, so the two criteria a browser would show —
 * readable in light and dark, legible at 375px without sideways scrolling — are
 * asserted against the stylesheet itself: real contrast maths on the colour
 * tokens, and a scan for the declarations that cause horizontal overflow.
 */

/** The custom properties declared in a block, e.g. `--bg: #fffdf7`. */
function tokens(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    found[match[1]!] = match[2]!.trim();
  }
  return found;
}

const lightBlock = /:root\s*\{([\s\S]*?)\}/.exec(CSS)?.[1] ?? "";
const darkBlock =
  /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/.exec(CSS)?.[1] ?? "";

const LIGHT = tokens(lightBlock);
const DARK = tokens(darkBlock);

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a six-digit hex colour: ${hex}`);
  const int = Number.parseInt(m[1]!, 16);
  return (
    0.2126 * channel((int >> 16) & 0xff) +
    0.7152 * channel((int >> 8) & 0xff) +
    0.0722 * channel(int & 0xff)
  );
}

/** WCAG 2.1 contrast ratio, 1 (identical) to 21 (black on white). */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SCHEMES = [
  ["light", LIGHT],
  ["dark", DARK],
] as const;

describe("colour scheme", () => {
  test("opts into both schemes so form controls and scrollbars follow suit", () => {
    expect(CSS).toContain("color-scheme: light dark");
  });

  test("redefines every token under prefers-color-scheme: dark", () => {
    expect(Object.keys(DARK).toSorted()).toEqual(
      Object.keys(LIGHT)
        .filter((name) => name !== "")
        .toSorted(),
    );
  });

  for (const [name, scheme] of SCHEMES) {
    test(`${name}: body text clears WCAG AA against the background`, () => {
      expect(contrast(scheme.text!, scheme.bg!)).toBeGreaterThanOrEqual(4.5);
    });

    test(`${name}: muted text clears WCAG AA against the background`, () => {
      expect(contrast(scheme.muted!, scheme.bg!)).toBeGreaterThanOrEqual(4.5);
    });

    test(`${name}: links clear WCAG AA against the background`, () => {
      expect(contrast(scheme.accent!, scheme.bg!)).toBeGreaterThanOrEqual(4.5);
    });

    test(`${name}: the call-to-action label clears WCAG AA against its fill`, () => {
      expect(contrast(scheme["accent-contrast"]!, scheme.accent!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("legibility at a 375px viewport", () => {
  test("declares no fixed or minimum width wider than a small phone", () => {
    const offenders = [...CSS.matchAll(/\b(?:min-width|width)\s*:\s*(\d+)px/g)].filter(
      (match) => Number(match[1]) > 375,
    );
    expect(offenders.map((match) => match[0])).toEqual([]);
  });

  test("bounds the column with a relative max-width that collapses on a phone", () => {
    expect(CSS).toMatch(/max-width:\s*[\d.]+rem/);
    expect(CSS).not.toMatch(/max-width:\s*\d{4,}px/);
  });

  test("breaks long unbroken strings, such as a pasted URL, instead of overflowing", () => {
    expect(CSS).toContain("overflow-wrap: break-word");
  });

  test("borders and padding are inside the box, so a full-width element still fits", () => {
    expect(CSS).toContain("box-sizing: border-box");
  });

  test("keeps the heading from overflowing by scaling it with the viewport", () => {
    expect(CSS).toMatch(/font-size:\s*clamp\(/);
  });
});

describe("stylesheet self-containment", () => {
  test("fetches nothing: no font, image, or imported sheet", () => {
    expect(CSS).not.toMatch(/url\(/);
    expect(CSS).not.toMatch(/@import/);
  });

  /* The whole sheet is one template literal, so a backtick inside it — easily
     typed when quoting a property in a comment, e.g. `100%` — closes the string
     early and the file stops parsing. That failure surfaces as an opaque 500
     from the dev server rather than as anything naming this file, so it is
     worth a test that says what went wrong. */
  test("contains no backtick, which would terminate the template literal", () => {
    expect(CSS).not.toContain("`");
  });

  test("falls back to system fonts rather than a hosted family", () => {
    expect(CSS).toMatch(/font-family:[^;]*system-ui/);
  });
});
