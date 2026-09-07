// The header editor's wiring (#119): the rules are tested in
// worpHeaderDraft.test.ts, and what is asserted here is that the row renders
// what those rules say — the per-row message in the field, the hint above the
// button, and a Save button disabled exactly when there is no patch.
//
// This package has no DOM harness, so only the states a fresh render can reach
// are covered; the rest of the matrix is the pure suite's.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorpHeadersRow } from "./WorpHeadersRow";
import type { MaskedHeader } from "../../api/types";

const render = (extraHeaders: MaskedHeader[]) =>
  renderToStaticMarkup(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WorpHeadersRow extraHeaders={extraHeaders} />
    </QueryClientProvider>,
  );

/** The `<button>` whose label is `label`, as markup. */
const button = (html: string, label: string): string => {
  const at = html.indexOf(`>${label}<`);
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<button", at), at);
};

const STORED: MaskedHeader[] = [
  { name: "CF-Access-Client-Id", valueHint: "cf-clie…id1" },
  { name: "CF-Access-Client-Secret", valueHint: "cf-secr…et2" },
];

describe("the rows", () => {
  test("lists every stored header by name, with its masked hint", () => {
    const html = render(STORED);

    for (const header of STORED) {
      expect(html).toContain(header.name);
      expect(html).toContain(header.valueHint);
    }
  });

  test("shows no stored value — the browser is never given one", () => {
    const html = render(STORED);

    const valueFields = html.match(/<input[^>]*type="password"[^>]*>/g) ?? [];
    expect(valueFields).toHaveLength(STORED.length);
    for (const field of valueFields) expect(field).toContain('value=""');
  });
});

describe("Save and the hint agree", () => {
  test("an untouched draft cannot be saved, and says there is nothing to save", () => {
    const html = render(STORED);

    expect(button(html, "Save headers")).toContain("disabled");
    expect(html).toContain("No changes to save yet.");
  });

  test("with nothing stored either — an empty editor has nothing to send", () => {
    const html = render([]);

    expect(button(html, "Save headers")).toContain("disabled");
    expect(html).toContain("No changes to save yet.");
  });

  // The advice that shipped with the bug: it told the user to remove a header
  // rather than retype every value, in the one state where removing a header
  // left Save dead until they retyped every value.
  test("no longer claims saving means retyping every stored value", () => {
    const html = render(STORED);

    expect(html.toLowerCase()).not.toContain("retyping each");
    expect(html).toContain("Leave one blank to keep it as it is");
  });
});
