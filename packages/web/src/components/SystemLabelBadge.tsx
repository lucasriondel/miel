import {
  ChevronsRight,
  Inbox,
  Info,
  MessageSquare,
  Tag,
  Users,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type SystemLabelMeta = {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  className: string;
  iconClassName?: string;
  iconOnly?: boolean;
};

const SYSTEM_LABELS: Record<string, SystemLabelMeta> = {
  CATEGORY_PERSONAL: {
    label: "Principale",
    Icon: Inbox,
    className: "bg-miel-bg text-miel-ink",
  },
  CATEGORY_PROMOTIONS: {
    label: "Promotions",
    Icon: Tag,
    className: "bg-emerald-50 text-emerald-900",
  },
  CATEGORY_UPDATES: {
    label: "Notifications",
    Icon: Info,
    className: "bg-amber-50 text-amber-900",
  },
  CATEGORY_FORUMS: {
    label: "Forums",
    Icon: MessageSquare,
    className: "bg-sky-50 text-sky-900",
  },
  CATEGORY_SOCIAL: {
    label: "Social",
    Icon: Users,
    className: "bg-indigo-50 text-indigo-900",
  },
  IMPORTANT: {
    label: "Important",
    Icon: ChevronsRight,
    className: "bg-transparent text-yellow-500",
    iconClassName: "h-4 w-4",
    iconOnly: true,
  },
};

export const isSystemLabel = (name: string) => name in SYSTEM_LABELS;

interface Props {
  name: string;
}

export const SystemLabelBadge = ({ name }: Props) => {
  const meta = SYSTEM_LABELS[name];
  if (!meta) return null;
  const { Icon, label, className, iconClassName, iconOnly } = meta;
  return (
    <span
      title={label}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className={iconClassName ?? "h-3 w-3"} aria-hidden />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </span>
  );
};
