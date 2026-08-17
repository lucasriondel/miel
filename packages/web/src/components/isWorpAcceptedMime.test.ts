import { describe, expect, test } from "bun:test";
import { isWorpAcceptedMime } from "./isWorpAcceptedMime";

describe("isWorpAcceptedMime", () => {
  test("accepts worp's five mime types", () => {
    expect(isWorpAcceptedMime("application/pdf")).toBe(true);
    expect(isWorpAcceptedMime("image/png")).toBe(true);
    expect(isWorpAcceptedMime("image/jpeg")).toBe(true);
    expect(isWorpAcceptedMime("image/webp")).toBe(true);
    expect(isWorpAcceptedMime("image/gif")).toBe(true);
  });
  test("rejects other types", () => {
    expect(isWorpAcceptedMime("text/plain")).toBe(false);
    expect(isWorpAcceptedMime("application/zip")).toBe(false);
    expect(isWorpAcceptedMime("image/tiff")).toBe(false);
    expect(isWorpAcceptedMime("application/octet-stream")).toBe(false);
  });
  test("handles missing / empty mime types", () => {
    expect(isWorpAcceptedMime(null)).toBe(false);
    expect(isWorpAcceptedMime(undefined)).toBe(false);
    expect(isWorpAcceptedMime("")).toBe(false);
  });
  test("falls back to extension for generic octet-stream", () => {
    expect(isWorpAcceptedMime("application/octet-stream", "MF02774888.pdf")).toBe(true);
    expect(isWorpAcceptedMime("application/octet-stream", "scan.PNG")).toBe(true);
    expect(isWorpAcceptedMime("binary/octet-stream", "photo.jpeg")).toBe(true);
    expect(isWorpAcceptedMime("application/octet-stream", "archive.zip")).toBe(false);
    expect(isWorpAcceptedMime("application/octet-stream", "noext")).toBe(false);
    expect(isWorpAcceptedMime("application/octet-stream", null)).toBe(false);
  });
  test("falls back to extension when mime is missing", () => {
    expect(isWorpAcceptedMime(null, "invoice.pdf")).toBe(true);
    expect(isWorpAcceptedMime("", "logo.gif")).toBe(true);
    expect(isWorpAcceptedMime(undefined, "notes.txt")).toBe(false);
  });
  test("does not fall back for a specific non-accepted mime type", () => {
    // Explicit MIME wins; a real text/plain named ".pdf" stays rejected.
    expect(isWorpAcceptedMime("text/plain", "weird.pdf")).toBe(false);
  });
  test("ignores charset parameters and case", () => {
    expect(isWorpAcceptedMime("application/pdf; charset=binary")).toBe(true);
    expect(isWorpAcceptedMime("APPLICATION/PDF")).toBe(true);
    expect(isWorpAcceptedMime("  image/PNG  ")).toBe(true);
  });
});
