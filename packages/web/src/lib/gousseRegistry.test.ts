import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// The shadcn pipeline is config, not code: `components.json` is what lets
// `bunx shadcn add @gousse/<item>` vendor gousse-ui source into this package.
// These assertions are the contract every later migration slice builds on.
const webRoot = resolve(import.meta.dir, "../..");
const read = (path: string) => Bun.file(resolve(webRoot, path));
const config = await read("components.json").json();

/** `@/lib/gousse` → the directory the CLI writes into. */
const fromAlias = (alias: string) => resolve(webRoot, alias.replace(/^@\//, "src/"));

describe("components.json", () => {
  test("resolves the gousse-ui registry namespace", () => {
    expect(config.registries["@gousse"]).toBe(
      "https://lucasriondel.github.io/gousse-ui/r/{name}.json",
    );
  });

  // Components land in shadcn's default `src/components/ui` (issue #71 checked
  // it for collisions against the populated `src/components`); registry libs
  // still get their own directory so they don't mix with app helpers.
  test("keeps vendored source in its own directories", () => {
    expect(config.aliases.lib).toBe("@/lib/gousse");
    expect(config.aliases.ui).toBe("@/components/ui");
  });

  test("points the utils alias at the vendored cn helper", () => {
    expect(config.aliases.utils).toBe("@/lib/gousse/utils");
  });
});

// Vendored files import each other through `@/`, so tsc and Vite both have to
// resolve it or the next slice's components break on arrival.
describe("the @ alias", () => {
  test("resolves to src/ for tsc", async () => {
    const tsconfig = JSON.parse(await read("tsconfig.json").text());
    expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
  });

  test("resolves to src/ for Vite", async () => {
    const viteConfig = await read("vite.config.ts").text();
    expect(viteConfig).toMatch(/"@":\s*path\.resolve\(__dirname, "\.\/src"\)/);
  });
});

describe("the vendored utils item", () => {
  test("sits where the lib alias points", () => {
    expect(existsSync(`${fromAlias(config.aliases.lib)}/utils.ts`)).toBe(true);
  });

  test("brings its dependencies with it, declared here", async () => {
    const pkg = await read("package.json").json();
    expect(pkg.dependencies).toHaveProperty("clsx");
    expect(pkg.dependencies).toHaveProperty("tailwind-merge");
  });
});

// The Base-UI-free half of the library (issue #71). Everything still on the
// npm package needs Base UI and waits for its own slice.
const VENDORED_UI = [
  "avatar",
  "badge",
  "button",
  "checkbox",
  "empty",
  "input",
  "radio-group",
  "rainbow-glow",
  "select",
  "sheen",
  "spinner",
  "switch",
  "textarea",
];

describe("the vendored Base-UI-free components", () => {
  test("all sit where the ui alias points", () => {
    const missing = VENDORED_UI.filter(
      (item) => !existsSync(`${fromAlias(config.aliases.ui)}/${item}.tsx`),
    );
    expect(missing).toEqual([]);
  });

  // Pulled in transitively: `input`/`textarea`/`select` share this chassis.
  test("field-chrome came along as a registry lib", () => {
    expect(existsSync(`${fromAlias(config.aliases.lib)}/field-chrome.ts`)).toBe(true);
  });

  // The stylesheet items land too; since #73 they are what `src/index.css`
  // imports (see styles/gousseStylesheets.test.ts).
  test("the stylesheet items came along as registry files", () => {
    const missing = ["tokens", "theme", "effects"].filter(
      (sheet) => !existsSync(resolve(webRoot, `src/styles/gousse/${sheet}.css`)),
    );
    expect(missing).toEqual([]);
  });

  test("declares class-variance-authority, which badge/button/empty need", async () => {
    const pkg = await read("package.json").json();
    expect(pkg.dependencies).toHaveProperty("class-variance-authority");
  });
});

// The Base UI half (issue #72), vendored in its own slice because it is the
// only one that drags a prerelease dependency into the app.
describe("the vendored Base UI components", () => {
  test("dropdown-menu and separator sit where the ui alias points", () => {
    const missing = ["dropdown-menu", "separator"].filter(
      (item) => !existsSync(`${fromAlias(config.aliases.ui)}/${item}.tsx`),
    );
    expect(missing).toEqual([]);
  });

  // The point of vendoring these two is the Base UI behaviour underneath —
  // focus management and dismissal for the menu, role/aria-orientation for the
  // rule. A hand-rolled lookalike would pass "the file exists" and lose it.
  test("still sit on Base UI's primitives", async () => {
    const ui = fromAlias(config.aliases.ui);
    expect(await Bun.file(`${ui}/dropdown-menu.tsx`).text()).toContain(
      'from "@base-ui-components/react/menu"',
    );
    expect(await Bun.file(`${ui}/separator.tsx`).text()).toContain(
      'from "@base-ui-components/react/separator"',
    );
  });

  // Declared here rather than ridden in transitively through the npm package:
  // this prerelease is the slice's accepted risk, so the pin has to be visible
  // in our own manifest and stay revertable on its own.
  test("pin @base-ui-components/react explicitly, at the registry's version", async () => {
    const pkg = await read("package.json").json();
    expect(pkg.dependencies["@base-ui-components/react"]).toBe("1.0.0-rc.0");
  });
});
