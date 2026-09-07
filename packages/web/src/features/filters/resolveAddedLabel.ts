import type { Label } from "../../api/types";

/** A label a filter adds, resolved to something a human can read. */
export interface AddedLabel {
  key: string;
  name: string;
  colorBg: string | null;
  colorFg: string | null;
}

const SYSTEM_LABEL_NAMES: Record<string, string> = {
  INBOX: "Inbox",
  CATEGORY_PERSONAL: "Personal",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
  CATEGORY_SOCIAL: "Social",
  STARRED: "Starred",
  IMPORTANT: "Important",
};

/**
 * Turns an `addLabelIds` entry into the badge the row shows. Shared by the
 * row and by search so both agree on what a filter's label is *called* —
 * searching for text the user can see must find the row carrying it.
 */
export function resolveAddedLabel(id: string, labelsByGmailId: Map<string, Label>): AddedLabel {
  const known = labelsByGmailId.get(id);
  if (known) {
    // Gmail stores category labels with raw IDs as their name
    // (e.g. "CATEGORY_PROMOTIONS") — show the friendly form when we have one.
    return {
      key: id,
      name: SYSTEM_LABEL_NAMES[known.name] ?? known.name,
      colorBg: known.colorBg,
      colorFg: known.colorFg,
    };
  }
  return {
    key: id,
    name: SYSTEM_LABEL_NAMES[id] ?? id,
    colorBg: null,
    colorFg: null,
  };
}
