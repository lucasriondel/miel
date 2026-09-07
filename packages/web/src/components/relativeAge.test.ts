import { describe, expect, it } from "bun:test";
import { relativeAge } from "./relativeAge";

const now = new Date("2026-09-02T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeAge", () => {
  it("says 'now' for anything under a minute", () => {
    expect(relativeAge(now, now)).toBe("now");
    expect(relativeAge(ago(59_000), now)).toBe("now");
  });

  it("counts whole minutes, then whole hours, then whole days", () => {
    expect(relativeAge(ago(MINUTE), now)).toBe("1m");
    expect(relativeAge(ago(59 * MINUTE), now)).toBe("59m");
    expect(relativeAge(ago(HOUR), now)).toBe("1h");
    expect(relativeAge(ago(23 * HOUR), now)).toBe("23h");
    expect(relativeAge(ago(DAY), now)).toBe("1d");
    // The design's own rows: three weeks reads as a two-character day count.
    expect(relativeAge(ago(19 * DAY), now)).toBe("19d");
  });

  it("stops counting past a year", () => {
    expect(relativeAge(ago(364 * DAY), now)).toBe("364d");
    expect(relativeAge(ago(365 * DAY), now)).toBe("1y+");
    expect(relativeAge(ago(4000 * DAY), now)).toBe("1y+");
  });

  it("treats a date ahead of the clock as just-arrived", () => {
    expect(relativeAge(new Date(now.getTime() + 5 * MINUTE), now)).toBe("now");
  });

  it("is empty for an unparseable date", () => {
    expect(relativeAge(new Date("nonsense"), now)).toBe("");
  });

  it("fits the row's fixed end cell at every age", () => {
    const samples = [0, 30 * MINUTE, 5 * HOUR, 9 * DAY, 300 * DAY, 900 * DAY];
    for (const ms of samples) {
      expect(relativeAge(ago(ms), now).length).toBeLessThanOrEqual(4);
    }
  });
});
