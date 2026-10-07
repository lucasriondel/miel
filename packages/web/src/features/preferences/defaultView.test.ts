// The default-view preference: which mailbox the app opens on when the URL
// names none. The store and the pure resolver are here; the redirect it drives
// is rendered in `App.test.tsx`, the row that writes it in `defaultViewRow.test.tsx`.
import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_VIEW_STORAGE_KEY,
  LAST_ACCOUNT_STORAGE_KEY,
  pinnedAccountId,
  pinnedAccountPreference,
  readDefaultViewPreference,
  resolveDefaultAccount,
  writeDefaultViewPreference,
} from "./defaultView";

afterEach(() => {
  localStorage.removeItem(DEFAULT_VIEW_STORAGE_KEY);
  localStorage.removeItem(LAST_ACCOUNT_STORAGE_KEY);
});

const A = { id: "a" };
const B = { id: "b" };

describe("the stored preference", () => {
  test("is 'last' until told otherwise", () => {
    expect(readDefaultViewPreference()).toBe("last");
  });

  test("a pinned account round-trips", () => {
    writeDefaultViewPreference(pinnedAccountPreference("b"));
    expect(readDefaultViewPreference()).toBe("account:b");
    expect(pinnedAccountId(readDefaultViewPreference())).toBe("b");
  });

  test("an unrecognised value is the default", () => {
    localStorage.setItem(DEFAULT_VIEW_STORAGE_KEY, "account:");
    expect(readDefaultViewPreference()).toBe("last");
    localStorage.setItem(DEFAULT_VIEW_STORAGE_KEY, "whatever");
    expect(readDefaultViewPreference()).toBe("last");
  });
});

describe("resolveDefaultAccount", () => {
  test("'last' answers the last account looked at", () => {
    expect(resolveDefaultAccount([A, B], "last", "b")).toBe(B);
  });

  test("'last' with nothing remembered answers the first", () => {
    expect(resolveDefaultAccount([A, B], "last", null)).toBe(A);
  });

  test("a pin ignores the last account", () => {
    expect(resolveDefaultAccount([A, B], "account:a", "b")).toBe(A);
  });

  test("an account that no longer exists falls back to the first", () => {
    expect(resolveDefaultAccount([A, B], "account:gone", "b")).toBe(A);
    expect(resolveDefaultAccount([A, B], "last", "gone")).toBe(A);
  });

  test("no accounts answers nothing", () => {
    expect(resolveDefaultAccount([], "last", "a")).toBeUndefined();
  });
});
