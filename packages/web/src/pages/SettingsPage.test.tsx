// The settings page's own structure: which groups it holds and in what order,
// and where credentials sit relative to the models that need them.
//
// Rendered to static markup, which is enough for both: a group is its anchor
// id, and a subsection is its caption. (The suite predates the DOM harness of
// #129 and is one of the ones still to convert; what it no longer needs is the
// window it used to hand back — no sibling suite stubs a bare `globalThis.window`
// any more, so there is no polluted global to undo here.)
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { PROVIDER_LABELS } from "@miel/core/providerModels";
import { SettingsPage } from "./SettingsPage";
import type { LayoutContext } from "../App";

/**
 * The page reads its sidebar state from the layout's outlet context, so it has
 * to be rendered as a route under an `<Outlet>` that provides one — rendering
 * the component bare throws on the destructure.
 *
 * Only the two fields the page destructures are supplied. The rest of
 * `LayoutContext` is the inbox's (date range, view mode, selected account); a
 * settings render that needed them would be reaching past its own props, which
 * is worth a type error rather than eleven invented values.
 */
const render = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: Pick<LayoutContext, "sidebarCollapsed" | "onToggleSidebar"> = {
    sidebarCollapsed: false,
    onToggleSidebar: () => {},
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/" element={<Outlet context={context} />}>
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

/** Every group's anchor id, in the order the page renders them. */
const groupIds = (html: string) =>
  [...html.matchAll(/<section id="([a-z-]+)"/g)].map((match) => match[1]!);

describe("SettingsPage", () => {
  test("puts Connections before AI & Triage — credentials come before what runs on them", () => {
    const html = render();

    expect(html).toContain("AI &amp; Triage");
    expect(groupIds(html)).toEqual(["general", "connections", "ai", "integrations"]);
    expect(html.indexOf('id="connections"')).toBeLessThan(html.indexOf('id="ai"'));
  });

  test("groups mailboxes with the AI credentials, and keeps no Data group", () => {
    const html = render();

    // "Data" named the storage; the group held one card of Gmail accounts,
    // which is a connection with a credential behind it like the others.
    expect(html).toContain(">AI providers<");
    expect(html).toContain(">Mailboxes<");
    expect(html).not.toContain(">Data<");
    expect(groupIds(html)).not.toContain("data");
  });

  test("holds one credentials subsection rather than a token pill beside a keys card", () => {
    const html = render();

    expect(html).not.toContain(">AI token<");
    expect(html).not.toContain(">API keys<");
  });

  test("that subsection carries a row for every provider", () => {
    const html = render();

    for (const label of Object.values(PROVIDER_LABELS)) {
      expect(html).toContain(label);
    }
  });
});
