import { describe, expect, test } from "bun:test";
import { rowDate } from "./rowDate";

const NOW = new Date(2026, 10, 18, 15, 30);

describe("rowDate", () => {
  test("today's mail says the time", () => {
    expect(rowDate(new Date(2026, 10, 18, 10, 42), NOW)).toBe("10:42");
  });

  test("the past week says the weekday", () => {
    expect(rowDate(new Date(2026, 10, 17, 9, 0), NOW)).toBe("Tue");
    expect(rowDate(new Date(2026, 10, 13, 9, 0), NOW)).toBe("Fri");
  });

  test("earlier this year says the day and month, and before that the year too", () => {
    expect(rowDate(new Date(2026, 9, 27, 9, 0), NOW)).toBe("Oct 27");
    expect(rowDate(new Date(2025, 9, 27, 9, 0), NOW)).toBe("Oct 27, 2025");
  });

  test("an invalid date says nothing", () => {
    expect(rowDate(new Date("nope"), NOW)).toBe("");
  });
});
