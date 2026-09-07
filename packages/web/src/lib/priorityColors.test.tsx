// The `Priority` → colour-class mapping has one owner (#140), and what it maps
// to is now text rather than a filled pill (#141).
//
// Two surfaces state a priority — the inbox section header
// (`components/PrioritySection`) and the detail view's triage row
// (`features/message-detail/PriorityText`) — and each used to spell
// `bg-gousse-<priority> text-white` out for itself, so recolouring priority
// meant finding both.
//
// The call-site tests are rendered and derive what they expect from
// `priorityInk`, which is the property worth having: recolour the module and
// a component that kept a copy of the old string fails here. Asserting the
// literals against the component source could not tell a second copy from a
// consumed one.
//
// The contrast block is the other half of #141: with the filled shape gone,
// colour is doing work on its own, so the class the module names has to resolve
// to something legible in both themes. happy-dom loads no stylesheet, so it is
// computed from the sheets that define the tokens rather than read off a node.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listedMessage } from "../api/listedMessage.fixture";
import type { Priority } from "../api/types";
import { PrioritySection } from "../components/PrioritySection";
import { TriageActivityProvider } from "../contexts/TriageActivityContext";
import { PriorityText } from "../features/message-detail/PriorityText";
import { priorityInk } from "./priorityColors";

const PRIORITIES: Priority[] = ["high", "medium", "low"];

// Neither surface needs the network, so any request is a mistake.
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    throw new Error(`unexpected request: ${String(input)}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("the mapping", () => {
  test("paints each priority with its own on-surface token (DESIGN.md §1)", () => {
    expect(priorityInk("high")).toBe("text-gousse-high-ink");
    expect(priorityInk("medium")).toBe("text-gousse-medium-ink");
    expect(priorityInk("low")).toBe("text-gousse-low-ink");
  });

  test("names a text colour and no fill at all", () => {
    for (const priority of PRIORITIES) {
      expect(priorityInk(priority)).not.toContain("bg-");
      expect(priorityInk(priority)).not.toContain("text-white");
    }
  });
});

// ---------------------------------------------------------------------------
// Contrast

const sheet = (path: string) => readFileSync(resolve(import.meta.dir, path), "utf8");
const tokensCss = sheet("../styles/gousse/tokens.css");
const indexCss = sheet("../index.css");

/** Every `--gousse-*` declaration inside blocks with this selector. */
const varsIn = (css: string, selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [, body] of css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g"))) {
    for (const [, name, value] of body!.matchAll(/(--gousse-[a-z-]+)\s*:\s*([^;]+);/g)) {
      out[name!] = value!.trim();
    }
  }
  return out;
};

/** index.css layers its own overrides over the vendored sheet; `.dark` over `:root`. */
const LIGHT = { ...varsIn(tokensCss, ":root"), ...varsIn(indexCss, ":root") };
const DARK = { ...LIGHT, ...varsIn(tokensCss, "\\.dark"), ...varsIn(indexCss, "\\.dark") };

/** A token's value, following `var(--other)` indirection. */
const value = (theme: Record<string, string>, token: string): string => {
  const raw = theme[token];
  if (raw === undefined) throw new Error(`${token} is not defined`);
  const indirect = /^var\(\s*(--[a-z-]+)\s*\)$/.exec(raw);
  return indirect ? value(theme, indirect[1]!) : raw;
};

/** `220 71 50` → the WCAG relative luminance of that colour. */
const luminance = (triplet: string): number => {
  const parts = triplet.split(/\s+/).map(Number);
  expect(parts).toHaveLength(3);
  const [r, g, b] = parts.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** `text-gousse-high-ink` → `--gousse-high-ink`. */
const tokenOf = (priority: Priority) => priorityInk(priority).replace(/^text-/, "--");

/** The two surfaces priority text is read against: the app background the
 *  section header sits on, and the panel the triage row sits on. */
const SURFACES = ["--gousse-bg", "--gousse-panel"];

describe("the colour is legible on its own", () => {
  test("the sheets parse into two themes with the surfaces to measure against", () => {
    for (const theme of [LIGHT, DARK]) {
      for (const surface of SURFACES) expect(value(theme, surface)).toMatch(/^\d+ \d+ \d+$/);
    }
    // A `.dark` that merely repeated `:root` would make every dark case below a
    // second light case.
    expect(value(DARK, "--gousse-bg")).not.toBe(value(LIGHT, "--gousse-bg"));
  });

  for (const priority of PRIORITIES) {
    for (const [themeName, theme] of [
      ["light", LIGHT],
      ["dark", DARK],
    ] as const) {
      for (const surface of SURFACES) {
        test(`${priority} on ${surface} clears AA in ${themeName}`, () => {
          const ratio = contrast(value(theme, tokenOf(priority)), value(theme, surface));
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The call sites

/**
 * Every class on every rendered element, one per entry. The filled pill is
 * looked for as an exact `bg-gousse-<priority>`: the danger hover the section's
 * "Delete all" carries is `hover:bg-gousse-high/10`, a different class doing a
 * different job, and a substring search would call it a pill.
 */
const renderedClasses = (root: HTMLElement): string[] =>
  [...root.querySelectorAll<HTMLElement>("*")].flatMap((node) =>
    node.className.split(/\s+/).filter(Boolean),
  );

describe("the call sites", () => {
  for (const priority of PRIORITIES) {
    test(`the triage row takes its ${priority} colour from the module`, () => {
      const { container } = render(<PriorityText priority={priority} />);

      expect(screen.getByText(priority).className).toContain(priorityInk(priority));
      expect(renderedClasses(container)).not.toContain(`bg-gousse-${priority}`);
    });

    test(`the section header colours its ${priority} heading from the module`, () => {
      const { container } = render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter initialEntries={["/account/acc-1"]}>
            <TriageActivityProvider>
              <PrioritySection
                accountId="acc-1"
                priority={priority}
                messages={[listedMessage({ priority })]}
              />
            </TriageActivityProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const heading = screen.getByRole("heading", { name: new RegExp(`^${priority}$`, "i") });
      expect(heading.className).toContain(priorityInk(priority));
      expect(renderedClasses(container)).not.toContain(`bg-gousse-${priority}`);
    });
  }
});
