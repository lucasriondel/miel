import { describe, expect, test } from "bun:test";
import { formatSize, truncateFilename } from "./attachmentDisplay";

describe("formatSize", () => {
  test("bytes below 1 KB", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1023)).toBe("1023 B");
  });
  test("kilobytes from 1024 up to but not including 1 MB", () => {
    expect(formatSize(1024)).toBe("1 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(1024 * 1023)).toBe("1023 KB");
  });
  test("megabytes with one decimal", () => {
    expect(formatSize(1024 * 1024)).toBe("1 MB");
    expect(formatSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
  test("trims trailing .0", () => {
    expect(formatSize(2 * 1024 * 1024)).toBe("2 MB");
    expect(formatSize(3 * 1024)).toBe("3 KB");
  });
});

describe("truncateFilename", () => {
  test("leaves short names unchanged", () => {
    expect(truncateFilename("report.pdf", 20)).toBe("report.pdf");
  });
  test("preserves extension when truncating", () => {
    expect(truncateFilename("a-very-long-report-name.pdf", 12)).toBe("a-very-….pdf");
  });
  test("falls back to (no name) for empty filename", () => {
    expect(truncateFilename("", 20)).toBe("(no name)");
  });
  test("handles extensionless names", () => {
    expect(truncateFilename("no-extension-file-name", 10)).toBe("no-extens…");
  });
});
