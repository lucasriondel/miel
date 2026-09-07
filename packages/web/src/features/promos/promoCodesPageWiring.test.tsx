// The Promo Codes page (#162), rendered as a user meets it: the page is mounted
// for real, the one request that leaves is its own, and what is asserted is the
// order the rows are read in.
//
// `fetch` is the seam rather than the api client, so the endpoint the page asks
// for is part of what is asserted. Any request the suite has not seeded is
// refused, so a query escaping the page fails loudly instead of answering a
// silent `{}`.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDENTIAL_PROVIDERS } from "@miel/core/providerModels";
import type { Account, SavedPromo, SavedPromoMail, SavedPromosPage } from "../../api/types";

/**
 * The real api client, put back before the subjects are imported — a bun module
 * mock is process-global, and this suite's claim is that the *real* client
 * builds the URL the server is asked for. See `promoSuggestionsWiring` for why
 * the spread matters.
 */
const realClient = await import("../../api/client.ts?real");
mock.module("../../api/client", () => ({ ...realClient }));

const { MielToaster } = await import("../../components/MielToaster");
const { queryKeys } = await import("../../api/queries");
const { PromoCodesPage } = await import("../../pages/PromoCodesPage");
const { App } = await import("../../App");

const MINE = "acc-1";
const THEIRS = "acc-2";

const promo = (over: Partial<SavedPromo> = {}): SavedPromo => ({
  id: "promo-1",
  accountId: MINE,
  accountEmail: "me@example.com",
  gmailMessageId: "mail-1",
  code: "WEEKEND20",
  discount: "20% off",
  terms: "orders over £50, excl. sale",
  expiresAt: "2026-12-24T23:59:59.999Z",
  merchant: "Zara",
  ...over,
});

/** The copy of the mail the save took, as the viewer reads one. */
const mail = (over: Partial<SavedPromoMail> = {}): SavedPromoMail => ({
  id: "promo-1",
  subject: "Your 20% weekend",
  fromName: "Zara",
  fromEmail: "newsletter@email.zara.com",
  internalDate: "2026-08-30T07:30:00.000Z",
  bodyHtml: "<p>WEEKEND20 — 20% off, ends Sunday</p>",
  bodyText: "WEEKEND20 — 20% off, ends Sunday",
  ...over,
});

const originalFetch = globalThis.fetch;
let urls: string[] = [];
let answer: SavedPromosPage = { active: [], expired: [] };
let original: SavedPromoMail = mail();

/** Every write the page made, in order — method, path and body as sent. */
interface Sent {
  method: string;
  path: string;
  body: unknown;
}
let sent: Sent[] = [];
/** A write the server refuses, so a refusal is a rendered path and not a mock. */
let refuseWrites = false;

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** What the clipboard was asked to hold, in the order it was asked. */
let copied: string[] = [];
const originalClipboard = navigator.clipboard;

/**
 * The two writes, applied to what the page will read next.
 *
 * A stub that recorded the request and then answered the *old* rows would let
 * "the new value is on screen" pass on a patch that named the wrong field — the
 * page re-reads after an edit, so the re-read has to be the server's own answer
 * to the request that just went out. This is that answer, and nothing more of a
 * server than that: an edited expiry comes back stored at the end of the day it
 * names, the way the real one stores it.
 */
const applyWrite = (method: string, id: string, body: Record<string, unknown>) => {
  const edit = (row: SavedPromo): SavedPromo => {
    const next = { ...row };
    for (const [field, value] of Object.entries(body)) {
      if (field === "expiresAt") {
        next.expiresAt = value === null ? null : `${String(value)}T23:59:59.999Z`;
      } else {
        Object.assign(next, { [field]: value });
      }
    }
    return next;
  };
  const section = (promos: SavedPromo[]) =>
    method === "DELETE"
      ? promos.filter((row) => row.id !== id)
      : promos.map((row) => (row.id === id ? edit(row) : row));
  answer = { active: section(answer.active), expired: section(answer.expired) };
};

beforeEach(() => {
  urls = [];
  sent = [];
  refuseWrites = false;
  answer = { active: [], expired: [] };
  original = mail();
  copied = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        copied.push(text);
      },
    },
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PATCH" || method === "DELETE") {
      const path = new URL(url).pathname;
      const body = init?.body === undefined ? null : JSON.parse(String(init.body));
      sent.push({ method, path, body });
      if (refuseWrites) {
        return new Response(JSON.stringify({ error: "promo_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const id = path.split("/").pop()!;
      applyWrite(method, id, (body as Record<string, unknown>) ?? {});
      return json(method === "DELETE" ? { ok: true, id } : { id, ...(body as object) });
    }
    if (url.includes("/promo-codes/saved")) {
      urls.push(url);
      return json(answer);
    }
    if (url.includes("/original")) {
      urls.push(url);
      return json(original);
    }
    throw new Error(`unexpected request: ${method} ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  });
});

const mountPage = (page: SavedPromosPage) => {
  answer = page;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/promo-codes"]}>
        {/* Mounted because one path here raises a toast: a browser that refuses
            the clipboard is the one click that did nothing. */}
        <MielToaster />
        <Routes>
          <Route path="/promo-codes" element={<PromoCodesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const sectionNamed = async (name: string) => {
  await waitFor(() => expect(screen.queryByRole("region", { name })).not.toBeNull());
  return screen.getByRole("region", { name })!;
};
const active = () => screen.queryByRole("region", { name: "Active promo codes" });
const expired = () => screen.queryByRole("region", { name: "Expired promo codes" });

/** What each row of a section says, in the order the rows are read. */
const rowsOf = (section: HTMLElement) =>
  within(section)
    .getAllByRole("row")
    // The header row is the one made of column headers.
    .filter((row) => within(row).queryAllByRole("columnheader").length === 0)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent?.trim() ?? ""),
    );

describe("what the page asks for", () => {
  test("the saved promos, with no account and no period", async () => {
    mountPage({ active: [promo()], expired: [] });

    await waitFor(() => expect(urls).toHaveLength(1));
    const url = new URL(urls[0]!);
    expect(url.pathname).toEndWith("/promo-codes/saved");
    expect(url.search).toBe("");
  });

  test("says so plainly when nothing has been saved yet", async () => {
    mountPage({ active: [], expired: [] });

    await waitFor(() => expect(urls).toHaveLength(1));
    expect(await screen.findByText(/no saved promo codes/i)).not.toBeNull();
    expect(active()).toBeNull();
    expect(expired()).toBeNull();
  });
});

describe("the active section", () => {
  test("shows the promo's fields and the account it arrived in", async () => {
    mountPage({ active: [promo()], expired: [] });

    const row = rowsOf(await sectionNamed("Active promo codes"))[0]!;
    expect(row).toContain("Zara");
    expect(row).toContain("20% off");
    expect(row).toContain("WEEKEND20");
    expect(row).toContain("orders over £50, excl. sale");
    expect(row).toContain("me@example.com");
    // The stored instant is the end of Christmas Eve, UTC; the cell says that
    // day and not the next one. (The month's spelling is the runtime locale's.)
    expect(row.some((cell) => /\b24\b/.test(cell) && cell.includes("2026"))).toBe(true);
  });

  // The account is a column, not a gate: nobody standing at a till should have
  // to remember which inbox a code came in, so every account is on screen at
  // once and there is nothing to pick first.
  test("shows every account's promos at once, with no account filter to satisfy", async () => {
    mountPage({
      active: [
        promo(),
        promo({ id: "promo-2", accountId: THEIRS, accountEmail: "other@example.com" }),
      ],
      expired: [],
    });

    const rows = rowsOf(await sectionNamed("Active promo codes"));
    expect(rows).toHaveLength(2);
    expect(rows.flat().join(" ")).toContain("other@example.com");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  // The server hands the sections back already ordered; what is asserted here is
  // that the page reads them out in the order it was given.
  test("reads the rows in the order the server answered", async () => {
    mountPage({
      active: [
        promo({ id: "soon", merchant: "Soon" }),
        promo({ id: "later", merchant: "Later" }),
        promo({ id: "open", merchant: "Open", expiresAt: null }),
      ],
      expired: [],
    });

    const merchants = rowsOf(await sectionNamed("Active promo codes")).map((row) => row[0]);
    expect(merchants).toEqual(["Soon", "Later", "Open"]);
  });

  test("names no deadline the mail never stated", async () => {
    mountPage({ active: [promo({ expiresAt: null, code: null, terms: null })], expired: [] });

    const row = rowsOf(await sectionNamed("Active promo codes"))[0]!;
    expect(row.some((cell) => cell === "No end date")).toBe(true);
    expect(row).not.toContain("WEEKEND20");
  });

  // Two saves are two decisions the user made, and the page does not overrule
  // either of them.
  test("shows a promo saved twice twice", async () => {
    mountPage({
      active: [promo({ id: "first" }), promo({ id: "second", gmailMessageId: "mail-reminder" })],
      expired: [],
    });

    expect(rowsOf(await sectionNamed("Active promo codes"))).toHaveLength(2);
  });
});

describe("the expired section", () => {
  test("sits below the active one, greyed", async () => {
    mountPage({
      active: [promo()],
      expired: [promo({ id: "lapsed", merchant: "Lapsed", expiresAt: "2026-07-01T23:59:59.999Z" })],
    });

    const found = await sectionNamed("Expired promo codes");
    expect(rowsOf(found)[0]![0]).toBe("Lapsed");
    // DOCUMENT_POSITION_FOLLOWING: the expired section comes after the active one.
    expect(active()!.compareDocumentPosition(found) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(found.className).toContain("opacity");
  });

  // No empty heading left behind on a page whose promos are all still good.
  test("is absent entirely when nothing has lapsed", async () => {
    mountPage({ active: [promo()], expired: [] });

    await sectionNamed("Active promo codes");
    expect(expired()).toBeNull();
  });

  // Nothing here clears itself: the record of what a shop offered stays until
  // the user takes it away, so a lapsed row carries exactly the controls a live
  // one does — including the one that removes it (#164), which is the only thing
  // anywhere that does.
  test("keeps the lapsed ones until the user removes one", async () => {
    mountPage({ active: [], expired: [promo({ id: "lapsed" })] });

    const found = await sectionNamed("Expired promo codes");
    expect(within(found).getByRole("button", { name: /delete promo code/i })).not.toBeNull();
    expect(within(found).getByRole("button", { name: /edit promo code/i })).not.toBeNull();
    // Nothing was asked of the server beyond the page's own read: a promo does
    // not expire off this page, it is deleted off it.
    expect(sent).toEqual([]);
  });
});

// Story 38/39: the code goes to the clipboard in one click, and copying is not
// using — there is no signal that a code was ever redeemed, so a "used" flag
// would need un-marking by hand and would lie in the meantime.
describe("taking the code", () => {
  const copyButton = async () => {
    const section = await sectionNamed("Active promo codes");
    return within(section).getByRole("button", { name: /copy code/i });
  };

  test("copies it in one click, and says so", async () => {
    mountPage({ active: [promo()], expired: [] });

    fireEvent.click(await copyButton());

    await waitFor(() => expect(copied).toEqual(["WEEKEND20"]));
    expect(await screen.findByRole("button", { name: /copied/i })).not.toBeNull();
  });

  test("changes nothing: no request leaves and the row is as it was", async () => {
    mountPage({ active: [promo()], expired: [] });
    await waitFor(() => expect(urls).toHaveLength(1));

    fireEvent.click(await copyButton());
    await waitFor(() => expect(copied).toHaveLength(1));

    // The page's own read, and nothing else — no save, no flag, no timestamp.
    expect(urls).toHaveLength(1);
    expect(rowsOf(await sectionNamed("Active promo codes"))[0]).toContain("WEEKEND20");
  });

  // A browser that refuses the clipboard is the one case where the click did
  // nothing, and it must not read as a copy that worked.
  test("says so when the browser refuses the clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    });
    mountPage({ active: [promo()], expired: [] });

    fireEvent.click(await copyButton());

    await waitFor(() => expect(screen.queryByText(/could not copy/i)).not.toBeNull());
    expect(screen.queryByRole("button", { name: /copied/i })).toBeNull();
  });

  // "No code needed, applied at checkout" is something the mail said; there is
  // nothing to put on a clipboard.
  test("offers nothing to copy when the offer needs no code", async () => {
    mountPage({ active: [promo({ code: null })], expired: [] });

    await sectionNamed("Active promo codes");
    expect(screen.queryByRole("button", { name: /copy code/i })).toBeNull();
  });
});

// Story 42/43: the mail is read from the copy the save took, which is why it is
// still there after Gmail purged the original the save trashed.
describe("reading the mail it came from", () => {
  const openMail = async () => {
    const section = await sectionNamed("Active promo codes");
    fireEvent.click(within(section).getByRole("button", { name: /view email/i }));
    return screen.findByRole("dialog");
  };

  test("asks for the promo's own copy, by the promo's id", async () => {
    mountPage({ active: [promo()], expired: [] });

    const dialog = await openMail();

    // The mail is named nowhere in the request: the copy hangs off the promo,
    // and `mail-1` may no longer exist anywhere.
    await waitFor(() => expect(urls).toHaveLength(2));
    expect(new URL(urls[1]!).pathname).toEndWith("/promo-codes/promo-1/original");
    expect(await within(dialog).findByText(/your 20% weekend/i)).not.toBeNull();
    expect(within(dialog).getByText(/zara/i)).not.toBeNull();
  });

  test("renders the mail as it looked", async () => {
    mountPage({ active: [promo()], expired: [] });

    const dialog = await openMail();

    const frame = (await within(dialog).findByTitle("message-body")) as HTMLIFrameElement;
    expect(frame.getAttribute("srcdoc")).toContain("WEEKEND20 — 20% off, ends Sunday");
  });

  test("falls back to the stored text when the mail had no HTML", async () => {
    original = mail({ bodyHtml: null });
    mountPage({ active: [promo()], expired: [] });

    const dialog = await openMail();

    expect(await within(dialog).findByText(/ends Sunday/)).not.toBeNull();
    expect(within(dialog).queryByTitle("message-body")).toBeNull();
  });

  test("says so plainly when the mail carried no body at all", async () => {
    original = mail({ bodyHtml: null, bodyText: null });
    mountPage({ active: [promo()], expired: [] });

    const dialog = await openMail();

    expect(await within(dialog).findByText(/no body/i)).not.toBeNull();
  });

  // The copy is a record and only the extracted guesses are corrigible, so
  // there is nothing in here to type into and nothing to save.
  test("is a record: nothing in it can be edited", async () => {
    mountPage({ active: [promo()], expired: [] });

    const dialog = await openMail();
    await within(dialog).findByText(/your 20% weekend/i);

    expect(within(dialog).queryAllByRole("textbox")).toEqual([]);
    const controls = within(dialog)
      .queryAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent ?? "");
    expect(controls.some((name) => /save|edit|delete/i.test(name))).toBe(false);
  });

  test("closes again, asking for nothing more", async () => {
    mountPage({ active: [promo()], expired: [] });

    const dialog = await openMail();
    await within(dialog).findByText(/your 20% weekend/i);
    fireEvent.click(within(dialog).getByRole("button", { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(urls).toHaveLength(2);
  });
});

// Story 40/41: every extracted field is corrigible, because they are the model's
// guesses on deliberately slippery prose — and the copy of the mail beside them
// is not, because it is a record of what the shop actually said.
const box = (name: RegExp) => screen.getByRole("textbox", { name });
const type = (name: RegExp, value: string) => fireEvent.change(box(name), { target: { value } });
const saveEdit = () => fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

describe("correcting what the extraction guessed", () => {
  const startEditing = async () => {
    const section = await sectionNamed("Active promo codes");
    fireEvent.click(within(section).getByRole("button", { name: /edit promo code/i }));
    return section;
  };

  test("opens every one of the five fields, and none of the mail's", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();

    // All five, because locking any of them guarantees the locked one is the
    // field the model got wrong.
    for (const name of [/merchant/i, /offer/i, /code/i, /terms/i]) {
      expect(box(name)).not.toBeNull();
    }
    // The expiry is a date box, not a text one: a promo expires on a date.
    expect(screen.getByLabelText("Expires").getAttribute("type")).toBe("date");

    // The record is not on offer: nothing here types over what the shop sent.
    const editable = screen
      .getAllByRole("textbox")
      .map((field) => field.getAttribute("aria-label") ?? "");
    expect(editable.some((name) => /subject|sender|email|body/i.test(name))).toBe(false);
  });

  test("sends only what changed, and shows the new value", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();

    type(/merchant/i, "Zara Home");
    type(/offer/i, "25% off");
    saveEdit();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: "PATCH",
      path: "/api/promo-codes/promo-1",
      // A patch: the three fields nobody touched are not named.
      body: { discount: "25% off", merchant: "Zara Home" },
    });

    await waitFor(() => expect(rowsOf(active()!)[0]).toContain("Zara Home"));
    expect(rowsOf(active()!)[0]).toContain("25% off");
    // And the row is a row again — the boxes are gone.
    expect(screen.queryAllByRole("textbox")).toEqual([]);
  });

  // The other half of "it is a patch": an emptied box is the user saying the
  // mail states none, which is a value.
  test("clears a field emptied", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();

    type(/terms/i, "");
    saveEdit();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ terms: null });
    await waitFor(() => expect(rowsOf(active()!)[0]).not.toContain("orders over £50, excl. sale"));
  });

  // A deadline crosses as the day someone picked, never as an instant, and comes
  // back stored as the end of that day — so the cell names the day it was given.
  test("sends an edited expiry as a calendar day", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();

    fireEvent.change(screen.getByLabelText("Expires"), { target: { value: "2026-10-31" } });
    saveEdit();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ expiresAt: "2026-10-31" });
    await waitFor(() =>
      expect(
        rowsOf(active()!)[0]!.some((cell) => /\b31\b/.test(cell) && cell.includes("2026")),
      ).toBe(true),
    );
  });

  // The headline is what makes a row a promo at all: it is the one field of the
  // five that cannot be emptied, refused here before a request leaves.
  test("will not save a promo with no offer left on it", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();

    type(/offer/i, "");
    saveEdit();

    expect(sent).toEqual([]);
    expect(screen.getByRole("button", { name: /save changes/i })).toHaveProperty("disabled", true);
  });

  test("abandons the typing on cancel, asking nothing of the server", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();

    type(/merchant/i, "Not this");
    fireEvent.click(screen.getByRole("button", { name: /cancel editing/i }));

    await waitFor(() => expect(screen.queryAllByRole("textbox")).toEqual([]));
    expect(sent).toEqual([]);
    expect(rowsOf(active()!)[0]).toContain("Zara");
  });

  // A save that changed nothing is nothing to send: the answer would be the row
  // as it already is.
  test("sends nothing when nothing was typed", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();
    saveEdit();

    await waitFor(() => expect(screen.queryAllByRole("textbox")).toEqual([]));
    expect(sent).toEqual([]);
  });

  // Nothing was written, so there is nothing to put back — what the user needs
  // is to be told the correction did not take.
  test("says so when the server refuses the edit, and keeps the row as it was", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();
    refuseWrites = true;

    type(/merchant/i, "Zara Home");
    saveEdit();

    await waitFor(() => expect(screen.queryByText(/could not save the changes/i)).not.toBeNull());
    expect(rowsOf(active()!)[0]).toContain("Zara");
  });

  // Two rows being corrected are two independent corrections; opening one must
  // not throw away typing in the other.
  test("edits one row without disturbing the next", async () => {
    mountPage({ active: [promo(), promo({ id: "promo-2", merchant: "Uniqlo" })], expired: [] });

    const section = await sectionNamed("Active promo codes");
    const editButtons = within(section).getAllByRole("button", { name: /edit promo code/i });
    fireEvent.click(editButtons[0]!);
    fireEvent.click(within(section).getAllByRole("button", { name: /edit promo code/i })[0]!);

    expect(screen.getAllByRole("textbox", { name: /merchant/i })).toHaveLength(2);
  });
});

// Story 37/44: the page is the user's to curate, and deletion is always their
// own act — which is exactly why it is asked for twice.
describe("removing a saved promo", () => {
  const deleteButton = async () => {
    const section = await sectionNamed("Active promo codes");
    return within(section).getByRole("button", { name: /delete promo code/i });
  };

  // The save trashed the Gmail original, and Gmail purges its trash a month
  // later: this row's copy of the mail is often the only one left anywhere.
  test("asks before it takes anything", async () => {
    mountPage({ active: [promo()], expired: [] });

    fireEvent.click(await deleteButton());

    expect(await screen.findByText(/delete this code\?/i)).not.toBeNull();
    expect(sent).toEqual([]);
    expect(rowsOf(active()!)).toHaveLength(1);
  });

  test("takes the row once confirmed, and the page no longer lists it", async () => {
    mountPage({ active: [promo()], expired: [] });

    fireEvent.click(await deleteButton());
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: "DELETE", path: "/api/promo-codes/promo-1" });
    await waitFor(() => expect(screen.queryByText(/no saved promo codes/i)).not.toBeNull());
  });

  test("takes nothing when the confirmation is dismissed", async () => {
    mountPage({ active: [promo()], expired: [] });

    fireEvent.click(await deleteButton());
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText(/delete this code\?/i)).toBeNull());
    expect(sent).toEqual([]);
    expect(rowsOf(active()!)).toHaveLength(1);
  });

  test("takes the row it was asked for and no other", async () => {
    mountPage({
      active: [promo(), promo({ id: "promo-2", merchant: "Uniqlo" })],
      expired: [],
    });

    const section = await sectionNamed("Active promo codes");
    fireEvent.click(within(section).getAllByRole("button", { name: /delete promo code/i })[1]!);
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.path).toEndWith("/promo-codes/promo-2");
    await waitFor(() => expect(rowsOf(active()!)).toHaveLength(1));
    expect(rowsOf(active()!)[0]).toContain("Zara");
  });

  test("says so when the server refuses, and the row stays", async () => {
    mountPage({ active: [promo()], expired: [] });
    refuseWrites = true;

    fireEvent.click(await deleteButton());
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(screen.queryByText(/could not delete the promo code/i)).not.toBeNull(),
    );
    expect(rowsOf(active()!)).toHaveLength(1);
  });
});

/** Where the router thinks it is, so a redirect that fired is visible. */
const Where = () => <span data-testid="where">{useLocation().pathname}</span>;

// The page belongs to no account, so it sits beside logs and settings rather
// than under `/account/:id` — and the layout's default-account redirect must
// leave it where it is.
describe("the route and the way in", () => {
  const ACCOUNT: Account = {
    id: MINE,
    email: "me@example.com",
    displayName: "Me",
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSyncedAt: null,
  };

  const mountApp = () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    qc.setQueryData(queryKeys.googleOAuthConfig, { configured: true, missing: [] });
    qc.setQueryData(queryKeys.accounts, [ACCOUNT]);
    qc.setQueryData(queryKeys.labels(MINE), []);
    qc.setQueryData(queryKeys.claudeCodeToken, { configured: true, hint: "sk-ant-…o4t" });
    for (const vendor of CREDENTIAL_PROVIDERS) {
      qc.setQueryData(queryKeys.providerCredential(vendor), {
        provider: vendor,
        configured: false,
        hint: null,
      });
    }
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/promo-codes"]}>
          <Where />
          <Routes>
            <Route path="/" element={<App />}>
              <Route path="promo-codes" element={<PromoCodesPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  test("is not swept into the default account's inbox", async () => {
    mountApp();

    // The redirect runs once the accounts are in hand; the page is still here.
    await screen.findByText(/no saved promo codes/i);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/promo-codes"));
  });

  test("one sidebar entry links to it", async () => {
    mountApp();

    const link = await screen.findByRole("link", { name: /promo codes/i });
    // Relative to the router's base, which the real router mounts at `/app`.
    expect(link.getAttribute("href")).toBe("/promo-codes");
  });
});
