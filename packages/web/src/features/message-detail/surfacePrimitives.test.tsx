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
  // The redesign's card (Main view › Card): a 12px corner on white, edged by
  // the plain hairline token — the same surface the inbox's sections sit on.
  test("is a rounded-xl white card with a hairline", () => {
    const cls = detailSurfaceClass();
    expect(cls).toContain("rounded-xl");
    expect(cls).toContain("bg-gousse-panel");
    expect(cls).toContain("border border-gousse-line");
    expect(cls).not.toContain("rounded-3xl");
  });

  // Flat by default; the raised variant is the design's faintest shadow, never
  // a ramp heavy enough to read as a floating layer.
  test("is flat at rest and only faintly raised", () => {
    expect(detailSurfaceClass()).not.toContain("shadow");
    expect(detailSurfaceClass("md")).toContain("shadow-[0_1px_2px_rgb(20_32_46/0.04)]");
  });

  // Tailwind v4 scans source text, so a shadow assembled at runtime would
  // compile to nothing. The raised shadow must exist as a literal.
  test("spells its shadow out as a literal for the scanner", async () => {
    const source = await Bun.file(new URL("./detailSurface.ts", import.meta.url)).text();
    expect(source).toContain('"shadow-[0_1px_2px_rgb(20_32_46/0.04)]"');
    expect(source).not.toMatch(/shadow-[\w[\]-]*\$\{/);
  });
});

describe("DetailCard", () => {
  test("renders a section wearing the shared surface", () => {
    const html = markup(<DetailCard>body</DetailCard>);
    expect(html).toStartWith("<section");
    expect(html).toContain("rounded-xl");
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

  // UI System › Segmented Control: a filled track with a 2px inset holding
  // 6px-cornered thumbs.
  test("is a filled track holding rounded thumbs", () => {
    const html = control("html");
    expect(html).toContain("rounded-lg bg-gousse-fill p-0.5");
    expect([...html.matchAll(/rounded-md/g)].length).toBe(2);
    expect(html).not.toContain("rounded-full");
  });

  test("lifts the active thumb in white with semibold ink, mutes the rest", () => {
    const html = control("html");
    expect(html).toContain("bg-gousse-panel font-semibold text-gousse-ink shadow-gousse-sm");
    expect(html).toContain("text-gousse-muted");
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

  test("transitions its colours only, never transition-all", () => {
    for (const cls of controlClasses(control("html"))) {
      expect(cls).toContain("transition-colors");
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

  test("is a <details> whose summary is a full-width quiet target", () => {
    expect(row).toContain("<details");
    expect(row).toContain("<summary");
    const [summary] = controlClasses(row);
    expect(summary).toContain("rounded-md");
    expect(summary).toContain("hover:bg-gousse-fill");
    expect(summary).toContain("w-full");
    expect(summary).toContain("cursor-pointer");
  });

  // A 32px floor for the click target: min-h-8 is 2rem.
  test("keeps a 32px minimum hit height", () => {
    expect(controlClasses(row)[0]).toContain("min-h-8");
  });

  test("carries a chevron that rotates once the row opens", () => {
    expect(row).toContain("group-open:rotate-180");
    expect(row).toContain("transition-transform");
  });

  test("hides the native marker so the chevron is the only affordance", () => {
    expect(controlClasses(row)[0]).toContain("list-none");
    expect(row).toContain("::-webkit-details-marker]:hidden");
  });

  test("transitions named properties and renders its children", () => {
    const [summary] = controlClasses(row);
    expect(summary).toMatch(/transition-\[/);
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

    test("keeps the same target as an unnested row", () => {
      const [summary] = controlClasses(inner);
      expect(summary).toContain("min-h-8");
      expect(summary).toContain("rounded-md");
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
