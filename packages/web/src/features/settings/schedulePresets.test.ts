import { expect, test, describe } from "bun:test";
import {
  INTERVAL_PRESETS,
  SINCE_PRESETS,
  intervalPresetLabel,
  sincePresetLabel,
} from "./schedulePresets";

describe("preset API contract", () => {
  test("every interval preset is an integer ≥ 1", () => {
    for (const p of INTERVAL_PRESETS) {
      expect(Number.isInteger(p.minutes)).toBe(true);
      expect(p.minutes).toBeGreaterThanOrEqual(1);
    }
  });

  test("every since preset is a non-empty window string", () => {
    for (const p of SINCE_PRESETS) {
      expect(p.value.length).toBeGreaterThan(0);
      expect(p.value).toMatch(/^\d+[hd]$/);
    }
  });

  test("preset labels are unique so the dropdown has no dupes", () => {
    const intervalLabels = INTERVAL_PRESETS.map((p) => p.label);
    expect(new Set(intervalLabels).size).toBe(intervalLabels.length);
    const sinceLabels = SINCE_PRESETS.map((p) => p.label);
    expect(new Set(sinceLabels).size).toBe(sinceLabels.length);
  });
});

describe("intervalPresetLabel", () => {
  test("returns the preset label for a known value", () => {
    expect(intervalPresetLabel(15)).toBe("Every 15 minutes");
    expect(intervalPresetLabel(60)).toBe("Every hour");
    expect(intervalPresetLabel(360)).toBe("Every 6 hours");
  });

  test("synthesizes an hour label for an out-of-preset whole-hour value", () => {
    expect(intervalPresetLabel(180)).toBe("Every 3 hours");
    expect(intervalPresetLabel(720)).toBe("Every 12 hours");
  });

  test("falls back to minutes for an arbitrary value", () => {
    expect(intervalPresetLabel(45)).toBe("Every 45 minutes");
    expect(intervalPresetLabel(1)).toBe("Every minute");
  });
});

describe("sincePresetLabel", () => {
  test("returns the preset label for a known window", () => {
    expect(sincePresetLabel("6h")).toBe("Last 6 hours");
    expect(sincePresetLabel("7d")).toBe("Last 7 days");
  });

  test("falls back to the raw string for an unknown window", () => {
    expect(sincePresetLabel("3d")).toBe("3d");
    expect(sincePresetLabel("48h")).toBe("48h");
  });
});
