import { describe, expect, test } from "bun:test";
import {
  dateInputValue,
  fromDateAndTime,
  nextWholeHour,
  presetTimeLabel,
  schedulePresets,
  snoozePresets,
  timeInputValue,
} from "./timePresets";

// Local-time constructors throughout: the presets are local by design, so the
// fixtures are too, and the suite passes in any zone.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

// 2026-11-18 is a Wednesday.
const WEDNESDAY_2PM = at(2026, 11, 18, 14, 20);

const shape = (presets: { id: string; at: Date }[]) =>
  presets.map((p) => [p.id, p.at.getTime()] as const);

describe("snoozePresets", () => {
  test("a weekday afternoon offers all four", () => {
    expect(shape(snoozePresets(WEDNESDAY_2PM))).toEqual([
      ["later-today", at(2026, 11, 18, 17).getTime()],
      ["tomorrow-morning", at(2026, 11, 19, 8).getTime()],
      ["this-weekend", at(2026, 11, 21, 8).getTime()],
      ["next-week", at(2026, 11, 23, 8).getTime()],
    ]);
  });

  test("later today rounds to the nearest hour", () => {
    const [later] = snoozePresets(at(2026, 11, 18, 9, 40));
    expect(later!.at.getTime()).toBe(at(2026, 11, 18, 13).getTime());
  });

  test("later today is left out once it would land in the evening", () => {
    const ids = snoozePresets(at(2026, 11, 18, 17, 0)).map((p) => p.id);
    expect(ids).not.toContain("later-today");
    expect(ids[0]).toBe("tomorrow-morning");
  });

  test("this weekend is left out on a Saturday and on a Sunday", () => {
    for (const day of [at(2026, 11, 21, 10), at(2026, 11, 22, 10)]) {
      expect(snoozePresets(day).map((p) => p.id)).not.toContain("this-weekend");
    }
  });

  test("next week from a Monday is the Monday after", () => {
    const next = snoozePresets(at(2026, 11, 23, 9)).find((p) => p.id === "next-week");
    expect(next!.at.getTime()).toBe(at(2026, 11, 30, 8).getTime());
  });

  test("next week from a Sunday is the next day", () => {
    const next = snoozePresets(at(2026, 11, 22, 21)).find((p) => p.id === "next-week");
    expect(next!.at.getTime()).toBe(at(2026, 11, 23, 8).getTime());
  });

  test("every preset is in the future", () => {
    for (const p of snoozePresets(WEDNESDAY_2PM)) {
      expect(p.at.getTime()).toBeGreaterThan(WEDNESDAY_2PM.getTime());
    }
  });
});

describe("schedulePresets", () => {
  test("is exactly tomorrow morning and Monday morning", () => {
    const presets = schedulePresets(WEDNESDAY_2PM);
    expect(presets.map((p) => p.label)).toEqual(["Tomorrow morning", "Monday morning"]);
    expect(shape(presets)).toEqual([
      ["tomorrow-morning", at(2026, 11, 19, 8).getTime()],
      ["monday-morning", at(2026, 11, 23, 8).getTime()],
    ]);
  });

  test("crosses a month and a year end", () => {
    const presets = schedulePresets(at(2026, 12, 31, 12));
    expect(presets[0]!.at.getTime()).toBe(at(2027, 1, 1, 8).getTime());
    expect(presets[1]!.at.getTime()).toBe(at(2027, 1, 4, 8).getTime());
  });
});

describe("presetTimeLabel", () => {
  test("today, this week, then a date", () => {
    expect(presetTimeLabel(at(2026, 11, 18, 17), WEDNESDAY_2PM)).toBe("Today 17:00");
    expect(presetTimeLabel(at(2026, 11, 24, 8), WEDNESDAY_2PM)).toBe("Tue 08:00");
    expect(presetTimeLabel(at(2026, 11, 25, 8, 5), WEDNESDAY_2PM)).toBe("25 Nov 08:05");
  });

  test("names the year only when it is not this one", () => {
    expect(presetTimeLabel(at(2027, 1, 30, 9), WEDNESDAY_2PM)).toBe("30 Jan 2027 09:00");
  });

  test("a past day is a date, not a weekday", () => {
    expect(presetTimeLabel(at(2026, 11, 17, 8), WEDNESDAY_2PM)).toBe("17 Nov 08:00");
  });
});

describe("the custom form's inputs", () => {
  test("round-trip a local moment", () => {
    const moment = at(2026, 3, 5, 7, 45);
    expect(dateInputValue(moment)).toBe("2026-03-05");
    expect(timeInputValue(moment)).toBe("07:45");
    expect(fromDateAndTime("2026-03-05", "07:45")!.getTime()).toBe(moment.getTime());
  });

  test("an empty or malformed input names no moment", () => {
    expect(fromDateAndTime("", "07:45")).toBeNull();
    expect(fromDateAndTime("2026-03-05", "")).toBeNull();
    expect(fromDateAndTime("05/03/2026", "07:45")).toBeNull();
  });

  test("start at the next whole hour", () => {
    expect(nextWholeHour(WEDNESDAY_2PM).getTime()).toBe(at(2026, 11, 18, 15).getTime());
  });
});
