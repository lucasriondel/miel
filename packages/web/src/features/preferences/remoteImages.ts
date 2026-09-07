import { useCallback, useSyncExternalStore } from "react";

export type RemoteImagesPreference = "show" | "hide";

/**
 * Browser-local, the way the theme is (#149): whether a message's remote images
 * load is a viewing preference of this browser's, not configuration of the
 * install, so it needs no schema, endpoint or migration.
 */
export const REMOTE_IMAGES_STORAGE_KEY = "miel-remote-images";

/**
 * Images load unless the user has said otherwise.
 *
 * This is the deliberate departure from Gmail and Apple Mail, which block by
 * default: a remote image is the standard read receipt, and loading one tells
 * the sender the address is live, when it was opened and roughly from where.
 * The product decision is that a mailbox one triages should read like mail, so
 * the price is paid by default — which is exactly why the other half of it, the
 * hide path, has to stay reachable rather than the behaviour being hardcoded.
 */
export const DEFAULT_REMOTE_IMAGES: RemoteImagesPreference = "show";

const isPreference = (value: unknown): value is RemoteImagesPreference =>
  value === "show" || value === "hide";

/**
 * Anything that is not one of the two literals — a key another version of this
 * app wrote, or a browser that refuses storage entirely — is the default rather
 * than an error: this preference has no failure state to report.
 */
export const readRemoteImagesPreference = (): RemoteImagesPreference => {
  try {
    const stored = localStorage.getItem(REMOTE_IMAGES_STORAGE_KEY);
    return isPreference(stored) ? stored : DEFAULT_REMOTE_IMAGES;
  } catch {
    return DEFAULT_REMOTE_IMAGES;
  }
};

const listeners = new Set<() => void>();

export const writeRemoteImagesPreference = (next: RemoteImagesPreference): void => {
  try {
    localStorage.setItem(REMOTE_IMAGES_STORAGE_KEY, next);
  } catch {
    // Storage refused; the choice still applies to this page, it just won't
    // outlive it.
  }
  for (const listener of listeners) listener();
};

/**
 * `storage` covers the browser's other tabs, the listener set this one: a tab
 * does not receive its own `storage` event, and the settings row and a message
 * body can be mounted together.
 */
export const subscribeRemoteImagesPreference = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

/**
 * The preference and the setter, for the row that offers it and the body that
 * obeys it.
 *
 * `getServerSnapshot` reads the same store rather than answering with the
 * default: this app is a Vite SPA that never server-renders, so the only caller
 * of that argument is a test rendering through `react-dom/server`, and a hook
 * that ignored the stored value there would make those tests unable to see a
 * preference at all.
 */
export const useRemoteImagesPreference = () => {
  const preference = useSyncExternalStore(
    subscribeRemoteImagesPreference,
    readRemoteImagesPreference,
    readRemoteImagesPreference,
  );
  const setPreference = useCallback(
    (next: RemoteImagesPreference) => writeRemoteImagesPreference(next),
    [],
  );
  return { preference, setPreference };
};
