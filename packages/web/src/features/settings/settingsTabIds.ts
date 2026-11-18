/**
 * The Settings page's four tabs, in the order the redesign draws them.
 *
 * The open tab is the URL's `?tab=` rather than component state, so a link can
 * land on one ("add a key" → `?tab=ai`) and a reload keeps the user where they
 * were. Anything the page does not recognise — no parameter, a stale name —
 * reads as the first tab rather than as an empty page.
 */
export const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "mailboxes", label: "Mailboxes" },
  { id: "ai", label: "AI" },
  { id: "sync", label: "Sync" },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export const SETTINGS_TAB_PARAM = "tab";

export const parseSettingsTab = (raw: string | null): SettingsTabId =>
  SETTINGS_TABS.find((t) => t.id === raw)?.id ?? "general";
