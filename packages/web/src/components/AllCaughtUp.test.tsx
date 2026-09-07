// The empty state names the period it is empty for, so its copy is one entry
// per period of the vocabulary — and the record is keyed by `RangeMode`, so a
// period added later cannot reach this component without wording of its own.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AllCaughtUp } from "./AllCaughtUp";
import type { RangeMode } from "../features/sync/dateRange";

describe("AllCaughtUp", () => {
  test.each([
    ["week", "All caught up this week", "Nothing left to triage for the selected week."],
    ["month", "All caught up this month", "Nothing left to triage for the selected month."],
    ["year", "All caught up this year", "Nothing left to triage for the selected year."],
  ] as [RangeMode, string, string][])("%s wording", (mode, title, description) => {
    render(<AllCaughtUp mode={mode} />);
    expect(screen.getByText(title)).toBeDefined();
    expect(screen.getByText(description)).toBeDefined();
  });
});
