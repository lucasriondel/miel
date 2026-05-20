import {
  AlertOctagon,
  ChevronsRight,
  FileEdit,
  Inbox,
  Info,
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
};

export const SYSTEM_LABELS: Record<string, SystemLabelMeta> = {
  INBOX: {
    label: "Boîte de réception",
    Icon: Inbox,
    className: "bg-miel-bg text-miel-ink",
  },
  CATEGORY_PERSONAL: {
    label: "Principale",
    Icon: Inbox,
    className: "bg-miel-bg text-miel-ink",
  },
  CATEGORY_PROMOTIONS: {
    label: "Promotions",
    Icon: Tag,
    className: "bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  },
  CATEGORY_UPDATES: {
    label: "Notifications",
    Icon: Info,
    className: "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  },
  CATEGORY_FORUMS: {
    label: "Forums",
    Icon: MessageSquare,
    className: "bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
  },
  CATEGORY_SOCIAL: {
    label: "Social",
    Icon: Users,
    className: "bg-indigo-50 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200",
  },
  IMPORTANT: {
    label: "Important",
    Icon: ChevronsRight,
    className: "bg-transparent text-yellow-500",
    iconClassName: "h-4 w-4",
    iconOnly: true,
  },
  STARRED: {
    label: "Suivis",
    Icon: Star,
    className: "bg-transparent text-yellow-500",
  },
  SENT: {
    label: "Envoyés",
    Icon: Send,
    className: "bg-miel-bg text-miel-ink",
  },
  DRAFT: {
    label: "Brouillons",
    Icon: FileEdit,
    className: "bg-miel-bg text-miel-ink",
  },
  SPAM: {
    label: "Spam",
    Icon: AlertOctagon,
    className: "bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-200",
  },
  TRASH: {
    label: "Corbeille",
    Icon: Trash2,
    className: "bg-miel-bg text-miel-muted",
  },
};

export const isSystemLabel = (name: string) => name in SYSTEM_LABELS;

export const getSystemLabelMeta = (name: string): SystemLabelMeta | undefined =>
  SYSTEM_LABELS[name];
