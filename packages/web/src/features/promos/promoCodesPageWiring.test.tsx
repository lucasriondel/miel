// The Promo Codes page (#162), rendered as a user meets it: the page is mounted
// for real, the one request that leaves is its own, and what is asserted is the
// order the rows are read in — then what the reader beside the list shows and
// does once a promo is opened (`miel.figcraft`, Promo codes › List + reader).
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
import type { Account, PromoListing, SavedPromoMail, SavedPromosPage } from "../../api/types";

/**
 * The real api client, put back before the subjects are imported — a bun module
 * mock is process-global, and this suite's claim is that the *real* client
 * builds the URL the server is asked for. See `rowPromosWiring` for why
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

const promo = (over: Partial<PromoListing> = {}): PromoListing => ({
  id: "promo-1",
  accountId: MINE,
  accountEmail: "me@example.com",
  gmailMessageId: "mail-1",
  code: "WEEKEND20",
  discount: "20% off",
  terms: "orders over £50, excl. sale",
  expiresAt: "2026-12-24T23:59:59.999Z",
  merchant: "Zara",
  savedAt: "2026-09-01T10:00:00.000Z",
  subject: "Weekend sale",
  fromName: "Zara",
  fromEmail: "news@zara.example",
  internalDate: "2026-09-01T09:00:00.000Z",
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
/** The detections nobody has acted on — the section above the saved ones (#154). */
let suggested: PromoListing[] = [];
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
  const edit = (row: PromoListing): PromoListing => {
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
  const section = (promos: PromoListing[]) =>
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
  suggested = [];
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
      // Clearing the expired section: the server drops every lapsed row.
      if (method === "DELETE" && path.endsWith("/saved/expired")) {
        const removed = answer.expired.length;
        answer = { ...answer, expired: [] };
        return json({ ok: true, removed });
      }
      const id = path.split("/").pop()!;
      applyWrite(method, id, (body as Record<string, unknown>) ?? {});
      return json(method === "DELETE" ? { ok: true, id } : { id, ...(body as object) });
    }
    // The save (#154 on this page): the server writes the promo, then trashes
    // the mail, and both reads move afterwards — the detection leaves the
    // suggestions and the promo joins the saved ones.
    if (method === "POST" && url.includes("/save")) {
      const path = new URL(url).pathname;
      sent.push({ method, path, body: null });
      if (refuseWrites) {
        return new Response(JSON.stringify({ error: "promo_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const id = path.split("/").at(-2)!;
      const saved = suggested.find((row) => row.id === id);
      suggested = suggested.filter((row) => row.id !== id);
      if (saved) answer = { ...answer, active: [...answer.active, saved] };
      return json({ ok: true, id, trashedThreadId: "thread-1" });
    }
    if (url.includes("/promo-codes/suggested")) {
      urls.push(url);
      return json({ items: suggested });
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

/** A detection nobody has acted on: the same row shape, with no save yet. */
const suggestion = (over: Partial<PromoListing> = {}): PromoListing =>
  promo({ id: "sug-1", savedAt: null, ...over });

const mountPage = (page: SavedPromosPage, detections: PromoListing[] = []) => {
  answer = page;
  suggested = detections;
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
const toReview = () => screen.queryByRole("region", { name: "Promo codes to review" });
const reader = () => screen.queryByRole("complementary", { name: "Promo reader" });

/** Each card or row of a section, in the order it is read. */
const itemsOf = (section: HTMLElement) =>
  Array.from(section.querySelectorAll<HTMLElement>("li, article"));
/** What each card or row says, in reading order. */
const textsOf = (section: HTMLElement) => itemsOf(section).map((item) => item.textContent ?? "");
/** The names the cards and rows are announced by — "Zara 20% off". */
const namesOf = (section: HTMLElement) =>
  itemsOf(section).map((item) => item.getAttribute("aria-label") ?? "");

/** Opens the `index`th card or row of a section in the reader. */
const openItem = async (section: HTMLElement, index = 0) => {
  fireEvent.click(within(section).getAllByRole("button", { name: /^open /i })[index]!);
  await waitFor(() => expect(reader()).not.toBeNull());
  return reader()!;
};

/** The paths the page read, whichever order the two queries resolved in. */
const paths = () => urls.map((u) => new URL(u).pathname);

describe("what the page asks for", () => {
  test("the saved promos, with no account and no period", async () => {
    mountPage({ active: [promo()], expired: [] });

    await waitFor(() => expect(urls).toHaveLength(2));
    const url = new URL(urls.find((u) => u.includes("/promo-codes/saved"))!);
    expect(url.pathname).toEndWith("/promo-codes/saved");
    expect(url.search).toBe("");
  });

  // The other half of what the page is for (#154): the section above the inbox
  // shows six cards, and the detections past that cap are reachable here. Its
  // read names no account and no period either.
  test("and every account's suggestions, with no account and no period", async () => {
    mountPage({ active: [], expired: [] }, [suggestion()]);

    await waitFor(() => expect(urls).toHaveLength(2));
    const url = new URL(urls.find((u) => u.includes("/promo-codes/suggested"))!);
    expect(url.pathname).toEndWith("/promo-codes/suggested");
    expect(url.search).toBe("");
  });

  test("says so plainly when there is nothing saved and nothing to review", async () => {
    mountPage({ active: [], expired: [] });

    await waitFor(() => expect(urls).toHaveLength(2));
    expect(await screen.findByText(/no promo codes yet/i)).not.toBeNull();
    expect(active()).toBeNull();
    expect(expired()).toBeNull();
    expect(toReview()).toBeNull();
    // The way back is always there; Sync needs a mailbox the layout names, and a
    // page mounted alone has none.
    expect(screen.getByRole("link", { name: /back to inbox/i })).not.toBeNull();
  });

  // Suggestions and nothing kept is a page with something to do, not an empty
  // one: the saved half says what saving would do.
  test("says nothing is saved yet when there are only suggestions", async () => {
    mountPage({ active: [], expired: [] }, [suggestion()]);

    const saved = await sectionNamed("Saved promo codes");
    expect(within(saved).getByText(/nothing saved yet/i)).not.toBeNull();
    expect(screen.queryByText(/no promo codes yet/i)).toBeNull();
  });
});

describe("the to-review section", () => {
  test("shows a detection's offer, code, deadline and terms on its card", async () => {
    mountPage({ active: [], expired: [] }, [suggestion()]);

    const card = textsOf(await sectionNamed("Promo codes to review"))[0]!;
    expect(card).toContain("Zara");
    expect(card).toContain("20% off");
    expect(card).toContain("WEEKEND20");
    expect(card).toContain("orders over £50, excl. sale");
    // The mail it was found in, by subject.
    expect(card).toContain("Weekend sale");
  });

  test("names the mailbox in the reader", async () => {
    mountPage({ active: [], expired: [] }, [suggestion()]);

    const opened = await openItem(await sectionNamed("Promo codes to review"));
    expect(within(opened).getByText(/not saved yet · me@example\.com/i)).not.toBeNull();
  });

  // Nothing at all rather than an empty heading: a user with no pending
  // detections is the steady state, and permanent chrome for it is a tax.
  test("is not drawn at all when nothing is suggested", async () => {
    mountPage({ active: [promo()], expired: [] });

    await sectionNamed("Active promo codes");
    expect(toReview()).toBeNull();
  });

  // The detections the inbox's six cards left out are the reason this exists,
  // so there is no cap here: a heavy newsletter week is fully readable.
  test("lists more detections than the inbox section would show", async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      suggestion({ id: `sug-${i}`, gmailMessageId: `mail-${i}`, code: `CODE${i}` }),
    );
    mountPage({ active: [], expired: [] }, many);

    expect(itemsOf(await sectionNamed("Promo codes to review"))).toHaveLength(9);
  });

  // Removing a detection would be a dismissal, which this feature does not
  // have; the guesses become corrigible once the promo is kept.
  test("offers no dismissal and no editor", async () => {
    mountPage({ active: [], expired: [] }, [suggestion()]);

    const section = await sectionNamed("Promo codes to review");
    expect(within(section).queryByRole("button", { name: /delete|dismiss/i })).toBeNull();
    const opened = await openItem(section);
    expect(within(opened).queryByRole("button", { name: /edit promo code/i })).toBeNull();
    expect(within(opened).queryByRole("button", { name: /delete promo code/i })).toBeNull();
  });

  // The same one gesture the chip on the inbox row offers: the promo is saved
  // with its copy of the mail, and the mail is trashed.
  test("saving one sends the save and moves it down to the saved ones", async () => {
    mountPage({ active: [], expired: [] }, [suggestion()]);

    const section = await sectionNamed("Promo codes to review");
    fireEvent.click(within(section).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: "POST", path: "/api/promo-codes/sug-1/save" });
    // The card leaves on the click, and the saved sections are re-read — which
    // section it lands in is the server's rule, not this page's.
    await waitFor(() => expect(toReview()).toBeNull());
    await sectionNamed("Active promo codes");
  });

  // "Save" on its face, the trash in its tooltip: a save that silently deleted
  // a message would be a surprise no undo makes up for.
  test("says the save also trashes the mail", async () => {
    mountPage({ active: [], expired: [] }, [suggestion()]);

    const section = await sectionNamed("Promo codes to review");
    const save = within(section).getByRole("button", { name: /^save$/i });
    expect(save.getAttribute("title")).toMatch(/trash/i);
  });

  test("puts the card back when the save is refused", async () => {
    mountPage({ active: [], expired: [] }, [suggestion()]);
    const section = await sectionNamed("Promo codes to review");
    refuseWrites = true;

    fireEvent.click(within(section).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    // Refused means nothing happened, and the card saying so is the only way the
    // user learns it: a card that stayed gone would read as a save that landed.
    await waitFor(() => expect(toReview()).not.toBeNull());
    expect(itemsOf(toReview()!)).toHaveLength(1);
  });

  // Nothing of the mail is kept until the save, so the reader reads nothing:
  // it says where the mail still is instead.
  test("reads no copy of the mail before it is saved", async () => {
    mountPage({ active: [], expired: [] }, [suggestion()]);

    const opened = await openItem(await sectionNamed("Promo codes to review"));
    expect(
      within(opened)
        .getByRole("link", { name: /open the email/i })
        .getAttribute("href"),
    ).toBe("/account/acc-1/messages/mail-1");
    expect(urls).toHaveLength(2);
  });
});

describe("the active section", () => {
  test("shows the promo's offer, terms and code", async () => {
    mountPage({ active: [promo()], expired: [] });

    const row = textsOf(await sectionNamed("Active promo codes"))[0]!;
    expect(row).toContain("Zara");
    expect(row).toContain("20% off");
    expect(row).toContain("WEEKEND20");
    expect(row).toContain("orders over £50, excl. sale");
  });

  // The stored instant is the end of Christmas Eve, UTC; the reader says that
  // day and not the next one. (The month's spelling is the runtime locale's.)
  test("reads the deadline as the UTC day it is the end of", async () => {
    mountPage({ active: [promo()], expired: [] });

    const opened = await openItem(await sectionNamed("Active promo codes"));
    const until = within(opened).getByText("Valid until").nextElementSibling!.textContent ?? "";
    expect(until).toMatch(/\b24\b/);
    expect(until).toContain("2026");
  });

  // The account is said, not a gate: nobody standing at a till should have to
  // remember which inbox a code came in, so every account is on screen at once
  // and there is nothing to pick first. With two mailboxes the row names which.
  test("shows every account's promos at once, with no account filter to satisfy", async () => {
    mountPage({
      active: [
        promo(),
        promo({ id: "promo-2", accountId: THEIRS, accountEmail: "other@example.com" }),
      ],
      expired: [],
    });

    const rows = textsOf(await sectionNamed("Active promo codes"));
    expect(rows).toHaveLength(2);
    expect(rows.join(" ")).toContain("other@example.com");
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

    const names = namesOf(await sectionNamed("Active promo codes"));
    expect(names).toEqual(["Soon 20% off", "Later 20% off", "Open 20% off"]);
  });

  test("names no deadline the mail never stated", async () => {
    mountPage({ active: [promo({ expiresAt: null, code: null, terms: null })], expired: [] });

    const row = textsOf(await sectionNamed("Active promo codes"))[0]!;
    expect(row).toContain("No end date");
    expect(row).not.toContain("WEEKEND20");
  });

  // Two saves are two decisions the user made, and the page does not overrule
  // either of them.
  test("shows a promo saved twice twice", async () => {
    mountPage({
      active: [promo({ id: "first" }), promo({ id: "second", gmailMessageId: "mail-reminder" })],
      expired: [],
    });

    expect(itemsOf(await sectionNamed("Active promo codes"))).toHaveLength(2);
  });
});

describe("the expired section", () => {
  test("sits below the active one, greyed", async () => {
    mountPage({
      active: [promo()],
      expired: [promo({ id: "lapsed", merchant: "Lapsed", expiresAt: "2026-07-01T23:59:59.999Z" })],
    });

    const found = await sectionNamed("Expired promo codes");
    expect(namesOf(found)[0]).toBe("Lapsed 20% off");
    // DOCUMENT_POSITION_FOLLOWING: the expired section comes after the active one.
    expect(active()!.compareDocumentPosition(found) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(found).getByRole("list").hasAttribute("data-faded")).toBe(true);
  });

  // No empty heading left behind on a page whose promos are all still good.
  test("is absent entirely when nothing has lapsed", async () => {
    mountPage({ active: [promo()], expired: [] });

    await sectionNamed("Active promo codes");
    expect(expired()).toBeNull();
  });

  // Nothing here clears itself: the record of what a shop offered stays until
  // the user takes it away, so a lapsed promo carries exactly the controls a
  // live one does — including the one that removes it (#164), which is the only
  // thing anywhere that does.
  test("keeps the lapsed ones until the user removes one", async () => {
    mountPage({ active: [], expired: [promo({ id: "lapsed" })] });

    const found = await sectionNamed("Expired promo codes");
    expect(within(found).getByRole("button", { name: /delete promo code/i })).not.toBeNull();
    const opened = await openItem(found);
    expect(within(opened).getByRole("button", { name: /edit promo code/i })).not.toBeNull();
    // Nothing was asked of the server beyond the page's reads: a promo does not
    // expire off this page, it is deleted off it.
    expect(sent).toEqual([]);
  });

  // The whole section at once, still behind a confirmation — each row's copy
  // of the mail is very often the only one left.
  test("is cleared in one act once the user confirms", async () => {
    mountPage({
      active: [promo({ id: "live", merchant: "Live" })],
      expired: [promo({ id: "a" }), promo({ id: "b" })],
    });

    const found = await sectionNamed("Expired promo codes");
    fireEvent.click(within(found).getByRole("button", { name: /clear expired/i }));
    expect(sent).toEqual([]);
    expect(within(found).getByText("Delete 2 expired codes?")).not.toBeNull();
    fireEvent.click(within(found).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: "DELETE", path: "/api/promo-codes/saved/expired" });
    await waitFor(() => expect(expired()).toBeNull());
    expect(namesOf(active()!)[0]).toBe("Live 20% off");
  });

  test("asks nothing of the server when the confirm is cancelled", async () => {
    mountPage({ active: [], expired: [promo({ id: "a" })] });

    const found = await sectionNamed("Expired promo codes");
    fireEvent.click(within(found).getByRole("button", { name: /clear expired/i }));
    fireEvent.click(within(found).getByRole("button", { name: /cancel/i }));

    expect(within(found).getByRole("button", { name: /clear expired/i })).not.toBeNull();
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
    await waitFor(() => expect(urls).toHaveLength(2));

    fireEvent.click(await copyButton());
    await waitFor(() => expect(copied).toHaveLength(1));

    // The page's own two reads, and nothing else — no save, no flag, no timestamp.
    expect(urls).toHaveLength(2);
    expect(sent).toEqual([]);
    expect(textsOf(await sectionNamed("Active promo codes"))[0]).toContain("WEEKEND20");
    // Taking the code does not open the promo either.
    expect(reader()).toBeNull();
  });

  test("copies from the reader's ticket too", async () => {
    mountPage({ active: [promo()], expired: [] });

    const opened = await openItem(await sectionNamed("Active promo codes"));
    const ticket = within(opened).getByRole("region", { name: "Promo" });
    fireEvent.click(within(ticket).getByRole("button", { name: /copy code/i }));

    await waitFor(() => expect(copied).toEqual(["WEEKEND20"]));
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

  test("offers nothing to copy when the row carries no code", async () => {
    mountPage({ active: [promo({ code: null })], expired: [] });

    const opened = await openItem(await sectionNamed("Active promo codes"));
    expect(opened).not.toBeNull();
    expect(screen.queryByRole("button", { name: /copy code/i })).toBeNull();
  });
});

// Story 45: a row saved before #166 stopped writing code-less promos. The save
// trashed the Gmail original and Gmail purges its own trash a month later, so
// this row is very often the only surviving copy of that mail — nothing here
// deletes it, hides it or breaks its page. What went away (#168) is the *copy*
// that presented it as a normal kind of promo: the page no longer explains an
// offer that needs no code, because it no longer produces one.
describe("a saved promo that carries no code", () => {
  const legacy = () => promo({ code: null });

  test("still renders, with an unstated slot and no claim about the offer", async () => {
    mountPage({ active: [legacy()], expired: [] });

    const row = textsOf(await sectionNamed("Active promo codes"))[0]!;
    expect(row).toContain("Zara");
    expect(row).toContain("20% off");
    expect(row).toContain("orders over £50, excl. sale");
    // The same dash every other field the mail never stated gets — not a
    // sentence telling the user this offer needs no code.
    expect(row).toContain("—");
    expect(screen.queryByText(/no code needed/i)).toBeNull();
  });

  test("still opens the copy of the mail the save took", async () => {
    mountPage({ active: [legacy()], expired: [] });

    const opened = await openItem(await sectionNamed("Active promo codes"));
    expect(await within(opened).findByText(/your 20% weekend/i)).not.toBeNull();
  });

  // The rule is that a code cannot be *cleared*; a promo that never had one is
  // still corrigible in its other four fields, or it could not be fixed at all.
  test("is still correctable, and the patch names no code", async () => {
    mountPage({ active: [legacy()], expired: [] });

    await startEditing();
    type(/merchant/i, "Zara Home");
    saveEdit();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: "PATCH",
      path: "/api/promo-codes/promo-1",
      body: { merchant: "Zara Home" },
    });
    await waitFor(() => expect(textsOf(active()!)[0]).toContain("Zara Home"));
  });

  test("is still the user's to remove", async () => {
    mountPage({ active: [legacy()], expired: [] });

    const section = await sectionNamed("Active promo codes");
    fireEvent.click(within(section).getByRole("button", { name: /delete promo code/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: "DELETE", path: "/api/promo-codes/promo-1" });
    await waitFor(() => expect(screen.queryByText(/no promo codes yet/i)).not.toBeNull());
  });
});

// Story 42/43: the mail is read from the copy the save took, which is why it is
// still there after Gmail purged the original the save trashed.
describe("reading the mail it came from", () => {
  const openMail = async () => {
    const opened = await openItem(await sectionNamed("Active promo codes"));
    return within(opened).getByRole("region", { name: "Original email copy" });
  };

  test("asks for nothing until a promo is opened", async () => {
    mountPage({ active: [promo(), promo({ id: "promo-2" })], expired: [] });

    await sectionNamed("Active promo codes");
    await waitFor(() => expect(urls).toHaveLength(2));
    expect(paths().some((p) => p.endsWith("/original"))).toBe(false);
  });

  test("asks for the promo's own copy, by the promo's id", async () => {
    mountPage({ active: [promo()], expired: [] });

    const copy = await openMail();

    // The mail is named nowhere in the request: the copy hangs off the promo,
    // and `mail-1` may no longer exist anywhere.
    await waitFor(() => expect(urls).toHaveLength(3));
    expect(paths().some((p) => p.endsWith("/promo-codes/promo-1/original"))).toBe(true);
    expect(await within(copy).findByText(/your 20% weekend/i)).not.toBeNull();
    expect(within(copy).getByText(/newsletter@email\.zara\.com/)).not.toBeNull();
  });

  test("renders the mail as it looked", async () => {
    mountPage({ active: [promo()], expired: [] });

    const copy = await openMail();

    const frame = (await within(copy).findByTitle("message-body")) as HTMLIFrameElement;
    expect(frame.getAttribute("srcdoc")).toContain("WEEKEND20 — 20% off, ends Sunday");
  });

  test("falls back to the stored text when the mail had no HTML", async () => {
    original = mail({ bodyHtml: null });
    mountPage({ active: [promo()], expired: [] });

    const copy = await openMail();

    expect(await within(copy).findByText(/ends Sunday/)).not.toBeNull();
    expect(within(copy).queryByTitle("message-body")).toBeNull();
  });

  test("says so plainly when the mail carried no body at all", async () => {
    original = mail({ bodyHtml: null, bodyText: null });
    mountPage({ active: [promo()], expired: [] });

    const copy = await openMail();

    expect(await within(copy).findByText(/no body/i)).not.toBeNull();
  });

  // The copy is a record and only the extracted guesses are corrigible, so
  // there is nothing in it to type into and nothing to save.
  test("is a record: nothing in it can be edited", async () => {
    mountPage({ active: [promo()], expired: [] });

    const copy = await openMail();
    await within(copy).findByText(/your 20% weekend/i);

    expect(within(copy).queryAllByRole("textbox")).toEqual([]);
    expect(within(copy).queryAllByRole("button")).toEqual([]);
  });

  test("closes again, asking for nothing more", async () => {
    mountPage({ active: [promo()], expired: [] });

    const copy = await openMail();
    await within(copy).findByText(/your 20% weekend/i);
    fireEvent.click(screen.getByRole("button", { name: /close promo/i }));

    await waitFor(() => expect(reader()).toBeNull());
    // The page's two reads and the one the reader made; closing asks for nothing.
    expect(urls).toHaveLength(3);
  });
});

describe("stepping through the page", () => {
  test("goes from to-review to saved in the order the page is read", async () => {
    mountPage({ active: [promo({ merchant: "Kept" })], expired: [] }, [
      suggestion({ merchant: "Waiting" }),
    ]);

    const opened = await openItem(await sectionNamed("Promo codes to review"));
    expect(within(opened).getByText("1 of 2")).not.toBeNull();
    expect(within(opened).getByRole("button", { name: /previous promo/i })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.click(within(opened).getByRole("button", { name: /next promo/i }));

    await waitFor(() => expect(within(reader()!).getByText("2 of 2")).not.toBeNull());
    expect(within(reader()!).getByRole("region", { name: "Promo" }).textContent).toContain("Kept");
  });
});

// Story 40/41: every extracted field is corrigible, because they are the model's
// guesses on deliberately slippery prose — and the copy of the mail beside them
// is not, because it is a record of what the shop actually said.
const box = (name: RegExp) => screen.getByRole("textbox", { name });
const type = (name: RegExp, value: string) => fireEvent.change(box(name), { target: { value } });
const saveEdit = () => fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

/** Opens the first active promo and its editor. */
const startEditing = async () => {
  const opened = await openItem(await sectionNamed("Active promo codes"));
  fireEvent.click(within(opened).getByRole("button", { name: /edit promo code/i }));
  return opened;
};

describe("correcting what the extraction guessed", () => {
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

    await waitFor(() => expect(textsOf(active()!)[0]).toContain("Zara Home"));
    expect(textsOf(active()!)[0]).toContain("25% off");
    // And the ticket is a ticket again — the boxes are gone.
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
    await waitFor(() => expect(textsOf(active()!)[0]).not.toContain("orders over £50, excl. sale"));
  });

  // A deadline crosses as the day someone picked, never as an instant, and comes
  // back stored as the end of that day — so the ticket names the day it was given.
  test("sends an edited expiry as a calendar day", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();

    fireEvent.change(screen.getByLabelText("Expires"), { target: { value: "2026-10-31" } });
    saveEdit();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ expiresAt: "2026-10-31" });
    await waitFor(() => {
      const until = within(reader()!).getByText("Valid until").nextElementSibling!.textContent;
      expect(until).toMatch(/\b31\b/);
    });
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

  // The second field that cannot be emptied (#168), and for its own reason: a
  // promo row is a code someone copies at a checkout, and since #166 none is
  // written without one — so clearing it would make by hand the shape the
  // extraction stopped producing. Correcting it is exactly what this is for.
  test("will not save a code cleared off the promo, but takes a corrected one", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();

    type(/code/i, "");
    saveEdit();

    expect(sent).toEqual([]);
    expect(screen.getByRole("button", { name: /save changes/i })).toHaveProperty("disabled", true);

    type(/code/i, "SUMMER25");
    saveEdit();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ code: "SUMMER25" });
  });

  test("abandons the typing on cancel, asking nothing of the server", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();

    type(/merchant/i, "Not this");
    fireEvent.click(screen.getByRole("button", { name: /cancel editing/i }));

    await waitFor(() => expect(screen.queryAllByRole("textbox")).toEqual([]));
    expect(sent).toEqual([]);
    expect(textsOf(active()!)[0]).toContain("Zara");
  });

  // A save that changed nothing is nothing to send: the answer would be the
  // promo as it already is.
  test("sends nothing when nothing was typed", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();
    saveEdit();

    await waitFor(() => expect(screen.queryAllByRole("textbox")).toEqual([]));
    expect(sent).toEqual([]);
  });

  // Nothing was written, so there is nothing to put back — what the user needs
  // is to be told the correction did not take.
  test("says so when the server refuses the edit, and keeps the promo as it was", async () => {
    mountPage({ active: [promo()], expired: [] });
    await startEditing();
    refuseWrites = true;

    type(/merchant/i, "Zara Home");
    saveEdit();

    await waitFor(() => expect(screen.queryByText(/could not save the changes/i)).not.toBeNull());
    expect(textsOf(active()!)[0]).toContain("Zara");
  });

  // The edit belongs to the open promo: stepping to another one leaves it,
  // unsaved, rather than carrying the boxes over to a different promo.
  test("is left, unsaved, when another promo is opened", async () => {
    mountPage({ active: [promo(), promo({ id: "promo-2", merchant: "Uniqlo" })], expired: [] });
    const opened = await startEditing();

    type(/merchant/i, "Not this");
    fireEvent.click(within(opened).getByRole("button", { name: /next promo/i }));

    await waitFor(() => expect(screen.queryAllByRole("textbox")).toEqual([]));
    expect(sent).toEqual([]);
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
    expect(itemsOf(active()!)).toHaveLength(1);
  });

  test("takes the row once confirmed, and the page no longer lists it", async () => {
    mountPage({ active: [promo()], expired: [] });

    fireEvent.click(await deleteButton());
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: "DELETE", path: "/api/promo-codes/promo-1" });
    await waitFor(() => expect(screen.queryByText(/no promo codes yet/i)).not.toBeNull());
  });

  test("takes nothing when the confirmation is dismissed", async () => {
    mountPage({ active: [promo()], expired: [] });

    fireEvent.click(await deleteButton());
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText(/delete this code\?/i)).toBeNull());
    expect(sent).toEqual([]);
    expect(itemsOf(active()!)).toHaveLength(1);
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
    await waitFor(() => expect(itemsOf(active()!)).toHaveLength(1));
    expect(textsOf(active()!)[0]).toContain("Zara");
  });

  test("closes the reader when the open promo is the one removed", async () => {
    mountPage({ active: [promo(), promo({ id: "promo-2", merchant: "Uniqlo" })], expired: [] });

    const opened = await openItem(await sectionNamed("Active promo codes"));
    fireEvent.click(within(opened).getByRole("button", { name: /delete promo code/i }));
    fireEvent.click(within(opened).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    await waitFor(() => expect(reader()).toBeNull());
  });

  test("says so when the server refuses, and the row stays", async () => {
    mountPage({ active: [promo()], expired: [] });
    refuseWrites = true;

    fireEvent.click(await deleteButton());
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(screen.queryByText(/could not delete the promo code/i)).not.toBeNull(),
    );
    expect(itemsOf(active()!)).toHaveLength(1);
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
    nickname: null,
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
    await screen.findByText(/no promo codes yet/i);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/promo-codes"));
  });

  test("one sidebar entry links to it", async () => {
    mountApp();

    const link = await screen.findByRole("link", { name: /promo codes/i });
    // Relative to the router's base, which the real router mounts at `/app`.
    expect(link.getAttribute("href")).toBe("/promo-codes");
  });
});
