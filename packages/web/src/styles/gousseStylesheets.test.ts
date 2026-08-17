import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { compile } from "tailwindcss";

// Issue #73: the last thing `src/index.css` still took from the npm package
// was its three stylesheets. They now come from `src/styles/gousse/`, and the
// `@source` hint that only existed to make Tailwind scan node_modules is gone.
//
// These assertions compile `index.css` with Tailwind's own engine rather than
// grepping it: the sheets are load-order sensitive (tokens define the channel
// vars, theme maps them onto Tailwind theme variables, effects carries the
// keyframes), and the failure mode of getting that wrong is a utility that
// silently never gets emitted.
const srcDir = resolve(import.meta.dir, "..");
const indexCss = await Bun.file(resolve(srcDir, "index.css")).text();
const tokensCss = await Bun.file(resolve(srcDir, "styles/gousse/tokens.css")).text();

/** What `@tailwindcss/vite` does for us: resolve bare + relative @imports. */
async function loadStylesheet(id: string, base: string) {
  const path = id.startsWith(".")
    ? resolve(base, id)
    : Bun.resolveSync(id.endsWith(".css") ? id : `${id}/index.css`, base);
  return { path, base: dirname(path), content: await Bun.file(path).text() };
}

/** The Switch's two track colors, plus one utility from each theme namespace. */
const CANDIDATES = [
  "bg-gousse-accent",
  "bg-gousse-line",
  "text-gousse-muted",
  "shadow-gousse-md",
  "animate-fade-in",
];

const compiled = await compile(indexCss, { base: srcDir, loadStylesheet });
const css = compiled.build(CANDIDATES);

describe("the stylesheet @imports", () => {
  const imports = [...indexCss.matchAll(/^@import\s+"([^"]+)"/gm)].map(([, id]) => id!);

  test("resolve to vendored files, not the npm package", () => {
    expect(imports.filter((id) => id.includes("gousse-ui"))).toEqual([]);
    for (const sheet of ["tokens", "theme", "effects", "sidebar-chrome"]) {
      expect(imports).toContain(`./styles/gousse/${sheet}.css`);
    }
  });

  // Load-order sensitive, so the order is the contract, not just the set.
  test("keep tailwindcss first, then tokens, theme, effects, sidebar-chrome", () => {
    expect(imports).toEqual([
      "tailwindcss",
      "./styles/gousse/tokens.css",
      "./styles/gousse/theme.css",
      "./styles/gousse/effects.css",
      "./styles/gousse/sidebar-chrome.css",
    ]);
  });
});

describe("the @source hack", () => {
  // It existed only because Tailwind v4 skips node_modules when scanning for
  // utility classes. The components live in src/ now, where the default scan
  // already reaches them.
  test("no longer hints at the packaged components", () => {
    expect(indexCss).not.toContain("@source");
    const inNodeModules = compiled.sources.filter((source) =>
      source.pattern.includes("node_modules"),
    );
    expect(inNodeModules).toEqual([]);
  });
});

describe("the compiled sheet", () => {
  // The whole point of the cutover: these come out of the *vendored* effects.css.
  // The frozen package's copy predates the native-select appearance reset.
  test("carries the vendored effects, which are ahead of the package's", () => {
    expect(css).toContain(".gousse-select");
    expect(css).toContain("appearance: none");
  });

  // The sidebar's hue-driven surfaces ship as their own registry item alongside
  // the component. Forgetting the sheet typechecks fine and renders flat rows,
  // so assert the rules are actually in the compiled output.
  test("carries the sidebar chrome that ships with the sidebar item", () => {
    expect(css).toContain(".sidebar-row");
    expect(css).toContain("--hue");
    expect(css).toContain(".sidebar-glyph");
    expect(css).toContain(".sidebar-scroll");
    expect(css).toContain("@keyframes sidebarToggleIn");
  });

  test("still plays the rainbow-glow and sheen animations", () => {
    expect(css).toContain(".gousse-rainbow-glow");
    expect(css).toContain("@keyframes mielRainbowRotate");
    expect(css).toContain(".gousse-sheen");
    expect(css).toContain("@keyframes mielSheen");
  });

  // theme.css has to land after tokens.css or the `gousse-*` namespaces never
  // register and every one of these silently compiles to nothing.
  test("still generates the gousse-* utilities", () => {
    const missing = CANDIDATES.filter((c) => !new RegExp(`\\.${c}\\s*\\{`).test(css));
    expect(missing).toEqual([]);
    expect(css).toContain("var(--color-gousse-accent)");
  });

  test("still resolves body's @apply against the theme", () => {
    expect(css).toMatch(/body\s*\{[^}]*--color-gousse-bg/);
  });
});

/** Every `--gousse-accent` value a sheet sets, light first, dark second. */
const triplets = (source: string) =>
  [...source.matchAll(/--gousse-accent:\s*([\d\s]+);/g)].map((m) =>
    m[1]!.trim().replace(/\s+/g, " "),
  );

describe("the miel accent override", () => {
  // Both sides are read off the sheets rather than restated here. What these
  // assert is the layering — the override lands after the vendored default, so
  // it wins — and a hard-coded triplet turns a recolor into a failure that
  // reads like a broken cascade, which is exactly what happened when the accent
  // went from blue to honey (ab044af, found by #103).
  const [lightDefault, darkDefault] = triplets(tokensCss);
  const [lightOverride, darkOverride] = triplets(indexCss);

  test("index.css restates the accent for both themes", () => {
    expect(triplets(indexCss)).toHaveLength(2);
    expect(lightOverride).not.toBe(lightDefault);
    expect(darkOverride).not.toBe(darkDefault);
  });

  test("is still emitted after the tokens layer, so it wins", () => {
    const emittedDefault = css.indexOf(`--gousse-accent: ${lightDefault}`);
    expect(emittedDefault).toBeGreaterThan(-1);
    expect(css.indexOf(`--gousse-accent: ${lightOverride}`)).toBeGreaterThan(emittedDefault);
  });

  test("overrides the dark token too", () => {
    const emittedDefault = css.indexOf(`--gousse-accent: ${darkDefault}`);
    expect(emittedDefault).toBeGreaterThan(-1);
    expect(css.indexOf(`--gousse-accent: ${darkOverride}`)).toBeGreaterThan(emittedDefault);
  });
});
