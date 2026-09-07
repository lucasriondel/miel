// The pager's two arrows name the period they step, and that name is the only
// thing a screen reader gets — the glyph is a bare chevron. It used to be a
// ternary on "is this a month", which meant a third period would have been
// announced as a week (#150), so the noun comes off a per-mode record now and
// this suite asserts one label per mode.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DateRangeNavInline } from "./DateRangeNavInline";
import { buildRange, type RangeMode } from "../../features/sync/dateRange";

const renderPager = (mode: RangeMode) =>
  render(
    <DateRangeNavInline
      range={buildRange(new Date(2026, 5, 17), mode)}
      isCurrentPeriod
      canGoNext={false}
      onPrev={() => {}}
      onNext={() => {}}
      onToday={() => {}}
    />,
  );

describe("DateRangeNavInline", () => {
  test.each([
    ["week", "Previous week", "Next week"],
    ["month", "Previous month", "Next month"],
    ["year", "Previous year", "Next year"],
  ] as const)("%s arrows are labelled with their own period", (mode, prev, next) => {
    renderPager(mode);
    expect(screen.getByRole("button", { name: prev })).toBeDefined();
    expect(screen.getByRole("button", { name: next })).toBeDefined();
  });

  test("shows the range's label between the arrows", () => {
    renderPager("year");
    expect(screen.getByText("2026")).toBeDefined();
  });
});
