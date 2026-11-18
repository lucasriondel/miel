import {
  AlertOctagon,
  ChevronsRight,
  FileEdit,
  Inbox,
  CircleAlert,
  MailOpen,
  MessageSquare,
  Send,
  Star,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type SystemLabelMeta = {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  className: string;
  iconClassName?: string;
  iconOnly?: boolean;
  /**
   * Category accent as an `r g b` triplet. When set, the sidebar row drives its
   * `--hue` from it: the glyph is tinted at rest and the row bg/bar/glyph deepen
   * to the full hue on hover/active. Only the Gmail inbox categories carry one.
   */
  hue?: string;
  /**
   * The category's colour *as text* (its name, count and glyph in the inbox's
   * subgroup heading), light and dark. The design takes Gmail's own category
   * inks (#a15200 Updates, #1967d2 Social, #8430ce Forums, #137333 Promotions),
   * which clear 4.5:1 on white; dark mode needs a lighter value of each hue.
   */
  ink?: string;
  inkDark?: string;
  /** How strongly the heading band is tinted with `hue` (default 4%). */
  tint?: number;
};

export const SYSTEM_LABELS: Record<string, SystemLabelMeta> = {
  INBOX: {
    label: "Inbox",
    Icon: Inbox,
    className: "bg-gousse-bg text-gousse-ink",
  },
  CATEGORY_PERSONAL: {
    label: "Primary",
    Icon: MailOpen,
    className: "bg-gousse-bg text-gousse-ink",
  },
  CATEGORY_PROMOTIONS: {
    label: "Promotions",
    Icon: Tag,
    className: "bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
    hue: "24 128 56",
    ink: "19 115 51",
    inkDark: "129 201 149",
  },
  CATEGORY_UPDATES: {
    label: "Updates",
    Icon: CircleAlert,
    className: "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
    hue: "227 116 0",
    ink: "161 82 0",
    inkDark: "252 173 92",
    tint: 0.07,
  },
  CATEGORY_FORUMS: {
    label: "Forums",
    Icon: MessageSquare,
    className: "bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
    hue: "147 52 230",
    ink: "132 48 206",
    inkDark: "197 160 245",
  },
  CATEGORY_SOCIAL: {
    label: "Social",
    Icon: Users,
    className: "bg-indigo-50 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200",
    hue: "26 115 232",
    ink: "25 103 210",
    inkDark: "138 180 248",
  },
  IMPORTANT: {
    label: "Important",
    Icon: ChevronsRight,
    className: "bg-transparent text-yellow-500",
    iconClassName: "h-4 w-4",
    iconOnly: true,
  },
  STARRED: {
    label: "Starred",
    Icon: Star,
    className: "bg-transparent text-yellow-500",
  },
  SENT: {
    label: "Sent",
    Icon: Send,
    className: "bg-gousse-bg text-gousse-ink",
  },
  DRAFT: {
    label: "Drafts",
    Icon: FileEdit,
    className: "bg-gousse-bg text-gousse-ink",
  },
  SPAM: {
    label: "Spam",
    Icon: AlertOctagon,
    className: "bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-200",
  },
  TRASH: {
    label: "Trash",
    Icon: Trash2,
    className: "bg-gousse-bg text-gousse-muted",
  },
};

/**
 * Display order for mailbox rows in the sidebar nav block: primary inboxes,
 * then the colored Gmail categories, then the standard mailboxes. Names absent
 * here fall to the end (preserving alphabetical via the caller's stable sort).
 */
export const MAILBOX_ORDER = [
  "INBOX",
  "CATEGORY_PERSONAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
  "CATEGORY_SOCIAL",
  "STARRED",
  "IMPORTANT",
  "SENT",
  "DRAFT",
  "SPAM",
  "TRASH",
];

export const mailboxOrderIndex = (name: string) => {
  const i = MAILBOX_ORDER.indexOf(name);
  return i === -1 ? MAILBOX_ORDER.length : i;
};

export const isSystemLabel = (name: string) => name in SYSTEM_LABELS;

export const getSystemLabelMeta = (name: string): SystemLabelMeta | undefined =>
  SYSTEM_LABELS[name];
