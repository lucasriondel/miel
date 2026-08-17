import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailCard } from "./DetailCard";
import { detailSurfaceClass } from "./detailSurface";
import { DisclosureRow } from "./DisclosureRow";
import { PillSegmented } from "./PillSegmented";

// The three shapes every later slice of #85 reuses. This package has no DOM
// harness, so what is checked here is the markup the primitives own — the
// classes DESIGN.md actually legislates (radius §3, depth §2, active fill §1,
// press feedback and hit area §5) — not open/close behavior, which is the
// browser's `<details>` and stays a manual acceptance criterion.

const markup = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

/** Class attributes of every `<button>`/`<summary>` in a fragment of markup. */
const controlClasses = (html: string) =>
  [...html.matchAll(/<(?:button|summary)\b[^>]*class="([^"]*)"/g)].map(([, cls]) => cls!);

describe("detailSurfaceClass", () => {
  test("is a rounded-3xl panel — the card radius, not the old rounded-xl", () => {
    const cls = detailSurfaceClass();
    expect(cls).toContain("rounded-3xl");
    expect(cls).toContain("bg-gousse-panel");
  });

  // §2: depth is a shadow ramp; the border is a hairline at reduced alpha and
  // never carries the weight.
  test("takes depth from a shadow and edges with a reduced-alpha hairline", () => {
    expect(detailSurfaceClass()).toContain("shadow-gousse-sm");
    expect(detailSurfaceClass("md")).toContain("shadow-gousse-md");
    expect(detailSurfaceClass()).toMatch(/border border-gousse-line\/\d+/);
    expect(detailSurfaceClass()).not.toContain("border-2");
  });

  // Tailwind v4 scans source text, so an interpolated `shadow-gousse-${x}`
  // would compile to nothing. Both ramps must exist as literals in the module.
  test("spells both shadow ramps out as literals for the scanner", async () => {
    const source = await Bun.file(new URL("./detailSurface.ts", import.meta.url)).text();
    expect(source).toContain('"shadow-gousse-sm"');
    expect(source).toContain('"shadow-gousse-md"');
    expect(source).not.toMatch(/shadow-gousse-\$\{/);
  });
});

describe("DetailCard", () => {
  test("renders a section wearing the shared surface", () => {
    const html = markup(<DetailCard>body</DetailCard>);
    expect(html).toStartWith("<section");
    expect(html).toContain("rounded-3xl");
    expect(html).toContain("body");
  });

  test("clips its children so dividers stop at the corner arc", () => {
    expect(markup(<DetailCard>x</DetailCard>)).toContain("overflow-hidden");
  });

  test("keeps caller classes alongside its own", () => {
    expect(markup(<DetailCard className="mt-4">x</DetailCard>)).toContain("mt-4");
  });
});

describe("PillSegmented", () => {
  const control = (value: "html" | "text") =>
    markup(
      <PillSegmented
        ariaLabel="Body format"
        value={value}
        onChange={() => {}}
        options={[
          { value: "html", label: "HTML" },
          { value: "text", label: "Text" },
        ]}
      />,
    );

  test("is a pill track holding pill thumbs (§3)", () => {
    const html = control("html");
    const rounded = [...html.matchAll(/rounded-full/g)];
    // The track plus one thumb per option.
    expect(rounded.length).toBe(3);
    expect(html).not.toContain("rounded-lg");
  });

  test("fills the active thumb accent/15 with bold ink, mutes the rest (§1)", () => {
    const html = control("html");
    expect(html).toContain("bg-gousse-accent/15");
    expect(html).toContain("font-bold");
    expect(html).toContain("text-gousse-muted");
    // Never the hard accent fill the old square toggle used.
    expect(html).not.toContain("bg-gousse-accent text-white");
  });

  test("exposes the selection to assistive tech", () => {
    const html = control("text");
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Body format"');
    expect(html).toMatch(/HTML<\/button>/);
    // The checked radio is the one whose label is Text.
    const checked = [...html.matchAll(/<button[^>]*aria-checked="true"[^>]*>([^<]*)/g)];
    expect(checked.map(([, label]) => label)).toEqual(["Text"]);
  });

  test("presses with a named transition, never transition-all (§5)", () => {
    for (const cls of controlClasses(control("html"))) {
      expect(cls).toContain("active:scale-[0.96]");
      expect(cls).not.toContain("transition-all");
    }
  });
});

describe("DisclosureRow", () => {
  const row = markup(
    <DisclosureRow label="Details">
      <p>hidden</p>
    </DisclosureRow>,
  );

  test("is a <details> whose summary is a full-width pill target", () => {
    expect(row).toContain("<details");
    expect(row).toContain("<summary");
    const [summary] = controlClasses(row);
    expect(summary).toContain("rounded-full");
    expect(summary).toContain("w-full");
    expect(summary).toContain("cursor-pointer");
  });

  // §5: 40px floor for a click target. min-h-10 is 2.5rem.
  test("keeps a 40px minimum hit height", () => {
    expect(controlClasses(row)[0]).toContain("min-h-10");
  });

  test("carries a chevron that rotates once the row opens", () => {
    expect(row).toContain("group-open:rotate-180");
    expect(row).toContain("transition-transform");
  });

  test("hides the native marker so the chevron is the only affordance", () => {
    expect(controlClasses(row)[0]).toContain("list-none");
    expect(row).toContain("::-webkit-details-marker]:hidden");
  });

  test("presses with a named transition and renders its children", () => {
    const [summary] = controlClasses(row);
    expect(summary).toContain("active:scale-[0.96]");
    expect(summary).not.toContain("transition-all");
    expect(row).toContain("hidden");
  });

  test("can start open", () => {
    expect(
      markup(
        <DisclosureRow label="x" defaultOpen>
          y
        </DisclosureRow>,
      ),
    ).toContain("open=");
  });

  // A row inside another row's body cannot share the outer `group`: `group-open:`
  // matches any open `.group` ancestor, so opening the outer row would rotate the
  // inner chevron too. #89 nests one, hence the scoped variant.
  describe("nested", () => {
    const inner = markup(
      <DisclosureRow nested label="Earlier">
        <p>runs</p>
      </DisclosureRow>,
    );

    test("scopes both the group and the chevron to itself", () => {
      expect(inner).toContain("group/nested");
      expect(inner).toContain("group-open/nested:rotate-180");
      expect(inner).not.toMatch(/[^/]group-open:rotate-180/);
      expect(inner).not.toMatch(/class="group[ "]/);
    });

    test("keeps the same pill target as an unnested row", () => {
      const [summary] = controlClasses(inner);
      expect(summary).toContain("min-h-10");
      expect(summary).toContain("rounded-full");
      expect(summary).toContain("active:scale-[0.96]");
    });

    // Same scanner constraint as detailSurface's ramps: an interpolated group
    // name compiles to no rule, so both variants are literals in the source.
    test("spells both group variants out for the scanner", async () => {
      const source = await Bun.file(new URL("./DisclosureRow.tsx", import.meta.url)).text();
      expect(source).toContain('"group-open:rotate-180"');
      expect(source).toContain('"group-open/nested:rotate-180"');
      expect(source).not.toMatch(/group-open\/\$\{/);
    });
  });
});
