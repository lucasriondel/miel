import { useCallback, useSyncExternalStore } from "react";

/**
 * Which mailbox the app opens on when the URL names none — `/`, a bookmark, a
 * fresh tab. Browser-local, the way the theme and remote images are (#149): it
 * is how this browser likes to land, not configuration of the install.
 *
 * Two answers, stored as one string so the snapshot `useSyncExternalStore`
 * compares is a primitive:
 * - `"last"` — the account this browser was last looking at;
 * - `"account:<id>"` — always this one.
 */
export type DefaultViewPreference = "last" | `account:${string}`;

export const DEFAULT_VIEW_STORAGE_KEY = "miel-default-view";
/** The account last focused, written whatever the preference so switching to "last" works at once. */
export const LAST_ACCOUNT_STORAGE_KEY = "miel-last-account";

export const DEFAULT_DEFAULT_VIEW: DefaultViewPreference = "last";

const ACCOUNT_PREFIX = "account:";

const isPreference = (value: unknown): value is DefaultViewPreference =>
  value === "last" ||
  (typeof value === "string" &&
    value.startsWith(ACCOUNT_PREFIX) &&
    value.length > ACCOUNT_PREFIX.length);

export const pinnedAccountPreference = (accountId: string): DefaultViewPreference =>
  `${ACCOUNT_PREFIX}${accountId}`;

/** The account a preference pins, or null for "last". */
export const pinnedAccountId = (preference: DefaultViewPreference): string | null =>
  preference.startsWith(ACCOUNT_PREFIX) ? preference.slice(ACCOUNT_PREFIX.length) : null;

const readItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeItem = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage refused; the choice applies to this page only.
  }
};

export const readDefaultViewPreference = (): DefaultViewPreference => {
  const stored = readItem(DEFAULT_VIEW_STORAGE_KEY);
  return isPreference(stored) ? stored : DEFAULT_DEFAULT_VIEW;
};

export const readLastAccountId = (): string | null => readItem(LAST_ACCOUNT_STORAGE_KEY);

export const writeLastAccountId = (accountId: string): void => {
  if (readLastAccountId() !== accountId) writeItem(LAST_ACCOUNT_STORAGE_KEY, accountId);
};

const listeners = new Set<() => void>();

export const writeDefaultViewPreference = (next: DefaultViewPreference): void => {
  writeItem(DEFAULT_VIEW_STORAGE_KEY, next);
  for (const listener of listeners) listener();
};

export const subscribeDefaultViewPreference = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

/**
 * The account to open on. A pinned account that was since disconnected, or a
 * last-focused one that no longer exists, is not an error: it falls through to
 * the first account, which is what the app did before this preference existed.
 */
export const resolveDefaultAccount = <A extends { id: string }>(
  accounts: readonly A[],
  preference: DefaultViewPreference,
  lastAccountId: string | null,
): A | undefined => {
  const wanted = pinnedAccountId(preference) ?? lastAccountId;
  return accounts.find((a) => a.id === wanted) ?? accounts[0];
};

export const useDefaultViewPreference = () => {
  const preference = useSyncExternalStore(
    subscribeDefaultViewPreference,
    readDefaultViewPreference,
    readDefaultViewPreference,
  );
  const setPreference = useCallback(
    (next: DefaultViewPreference) => writeDefaultViewPreference(next),
    [],
  );
  return { preference, setPreference };
};
