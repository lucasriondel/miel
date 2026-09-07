// The inbox's period control, as a user drives it: three segments, a pager
// that steps whole periods, and a URL that carries the choice.
//
// Rendered rather than read (#129): `useDateRange` derives everything from the
// query string, so the only honest way to assert "picking Year lists that
// year" is to click the segment and read what the pager says — and what the
// URL now holds, since that is what a reload replays.
import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PeriodNav } from "../../components/topbar/PeriodNav";
import { useDateRange } from "./useDateRange";

const THIS_YEAR = String(new Date().getFullYear());

const Harness = () => {
  const { range, isCurrentPeriod, canGoNext, goPrev, goNext, goToday, setViewMode } =
    useDateRange();
  const { search } = useLocation();
  return (
    <>
      <PeriodNav
        range={range}
        onViewModeChange={setViewMode}
        isCurrentPeriod={isCurrentPeriod}
        canGoNext={canGoNext}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
      />
      <output data-testid="search">{search}</output>
    </>
  );
};

const mount = (entry = "/") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness />
    </MemoryRouter>,
  );

const search = () => screen.getByTestId("search").textContent ?? "";
const segment = (name: string) => screen.getByRole("tab", { name });
const label = () => screen.getByRole("tab", { selected: true }).textContent;
const period = (mode: "week" | "month" | "year") =>
  screen.getByRole("button", { name: `Previous ${mode}` });

describe("the period control", () => {
  test("offers week, month and year, and no All", () => {
    mount();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Week", "Month", "Year"]);
    expect(screen.queryByRole("tab", { name: "All" })).toBeNull();
  });

  test("picking Year shows the current year and says so in the URL", () => {
    mount();
    fireEvent.click(segment("Year"));
    expect(label()).toBe("Year");
    expect(screen.getByText(THIS_YEAR)).toBeDefined();
    expect(new URLSearchParams(search()).get("view")).toBe("year");
  });

  test("the pager is shown in every mode", () => {
    mount();
    expect(period("week")).toBeDefined();
    fireEvent.click(segment("Month"));
    expect(period("month")).toBeDefined();
    fireEvent.click(segment("Year"));
    expect(period("year")).toBeDefined();
  });

  test("switching mode re-snaps the period onto the new grid", () => {
    mount("/?view=year&range=2024-01-01");
    expect(screen.getByText("2024")).toBeDefined();
    fireEvent.click(segment("Month"));
    // A year's start is a January, so the month it lands on is a real one.
    expect(screen.getByText("January 2024")).toBeDefined();
    expect(new URLSearchParams(search()).get("range")).toBe("2024-01-01");
  });

  test("a URL still carrying the retired `all` value lands on the year", () => {
    mount("/?view=all");
    expect(label()).toBe("Year");
    expect(screen.getByText(THIS_YEAR)).toBeDefined();
  });
});

describe("the year pager", () => {
  test("a linked year round-trips through the URL", () => {
    mount("/?view=year&range=2024-06-17");
    expect(label()).toBe("Year");
    // Any day of 2024 names the year it falls in.
    expect(screen.getByText("2024")).toBeDefined();
  });

  test("steps whole years back and forward", () => {
    mount("/?view=year");
    fireEvent.click(period("year"));
    const previous = String(Number(THIS_YEAR) - 1);
    expect(screen.getByText(previous)).toBeDefined();
    expect(new URLSearchParams(search()).get("range")).toBe(`${previous}-01-01`);
    fireEvent.click(screen.getByRole("button", { name: "Next year" }));
    expect(screen.getByText(THIS_YEAR)).toBeDefined();
  });

  test("refuses to step past the current year", () => {
    mount("/?view=year");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Next year" }).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next year" }));
    expect(screen.getByText(THIS_YEAR)).toBeDefined();
  });

  test("Today returns to the current year", () => {
    mount("/?view=year");
    // The control only exists away from the current period.
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    fireEvent.click(period("year"));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText(THIS_YEAR)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
  });
});
