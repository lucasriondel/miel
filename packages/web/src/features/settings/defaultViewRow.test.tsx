// The Settings row for the default view: a select over "last opened" and each
// connected account, written browser-side on change.
import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "../../api/queries";
import type { Account } from "../../api/types";
import {
  DEFAULT_VIEW_STORAGE_KEY,
  pinnedAccountPreference,
  readDefaultViewPreference,
  writeDefaultViewPreference,
} from "../preferences/defaultView";
import { DefaultViewRow } from "./DefaultViewRow";

afterEach(() => localStorage.removeItem(DEFAULT_VIEW_STORAGE_KEY));

const account = (id: string, email: string): Account => ({
  id,
  email,
  displayName: null,
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: null,
});

const renderRow = (accounts: Account[]) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(queryKeys.accounts, accounts);
  render(
    <QueryClientProvider client={qc}>
      <DefaultViewRow />
    </QueryClientProvider>,
  );
  return screen.getByLabelText<HTMLSelectElement>("Default view");
};

const labels = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent);

describe("the default-view row", () => {
  test("offers 'last opened' and every connected account, last opened chosen", () => {
    const select = renderRow([account("a", "a@x.com"), account("b", "b@x.com")]);
    expect(labels(select)).toEqual(["Last opened account", "a@x.com", "b@x.com"]);
    expect(select.value).toBe("last");
  });

  test("picking an account pins it, and picking 'last' unpins it", () => {
    const select = renderRow([account("a", "a@x.com"), account("b", "b@x.com")]);

    fireEvent.change(select, { target: { value: pinnedAccountPreference("b") } });
    expect(readDefaultViewPreference()).toBe("account:b");
    expect(select.value).toBe("account:b");

    fireEvent.change(select, { target: { value: "last" } });
    expect(readDefaultViewPreference()).toBe("last");
  });

  test("a pinned account since disconnected is shown as such, not as another choice", () => {
    writeDefaultViewPreference(pinnedAccountPreference("gone"));
    const select = renderRow([account("a", "a@x.com")]);
    expect(labels(select)).toContain("Disconnected account");
    expect(select.value).toBe("account:gone");
  });
});
