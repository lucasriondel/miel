import { describe, expect, test } from "bun:test";
import { labelSwatch } from "./labelSwatch";

describe("labelSwatch", () => {
  test("a saturated background is the mark", () => {
    expect(labelSwatch("#16a765", "#ffffff")).toBe("#16a765");
  });

  test("a pale background gives way to its darker text colour", () => {
    expect(labelSwatch("#fce8b3", "#594c05")).toBe("#594c05");
  });

  test("falls back to a neutral grey when Gmail gave no colour", () => {
    expect(labelSwatch(null, null)).toBe("rgb(138 150 163)");
  });
});
