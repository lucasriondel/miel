import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Separator } from "./separator";

// The rest of the migration is checked by source scans, because this package
// has no DOM harness. These two are worth actually mounting: issue #72 pulled
// `@base-ui-components/react` — a prerelease — into the app for them, so the
// assertion that earns its keep is "the vendored module still resolves Base UI
// and still renders its semantics", not "the file exists".
//
// Server rendering only: it reaches the markup the primitives own. Opening,
// dismissal, submenu expansion and roving focus are Base UI's, live in a
// portal, and need a browser — those stay manual acceptance criteria.

const markup = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(node);

describe("Separator", () => {
  test("renders a hairline rule with separator semantics", () => {
    const html = markup(<Separator />);
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain("h-px w-full");
    expect(html).toContain("bg-gousse-line");
  });

  test("flips to a one-pixel column when vertical", () => {
    const html = markup(<Separator orientation="vertical" />);
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain("h-full w-px");
  });

  test("keeps caller classes alongside its own", () => {
    expect(markup(<Separator className="my-2" />)).toContain("my-2");
  });
});

describe("DropdownMenu", () => {
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  test("renders a trigger wired to a menu popup", () => {
    const html = markup(menu);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("Actions");
  });

  // Closed menus keep their items out of the document — the popup is
  // portalled, and nothing should leak into the trigger's own markup.
  test("leaves the items unrendered until it opens", () => {
    expect(markup(menu)).not.toContain("Archive");
  });
});
