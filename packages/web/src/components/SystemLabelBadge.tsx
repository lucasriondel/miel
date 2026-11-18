import { Badge } from "@/components/ui/badge";
import { getSystemLabelMeta } from "./systemLabels";

export { isSystemLabel } from "./systemLabels";

interface Props {
  name: string;
}

export const SystemLabelBadge = ({ name }: Props) => {
  const meta = getSystemLabelMeta(name);
  if (!meta) return null;
  const { Icon, label, className, iconClassName, iconOnly } = meta;
  return (
    <Badge
      variant="system"
      className={`h-5 gap-1 px-2 py-0 text-[11px] font-semibold shadow-none sm:px-2 sm:py-0 ${className}`}
      title={label}
      aria-label={label}
    >
      <Icon className={iconClassName ?? "h-3 w-3"} aria-hidden />
      {iconOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="hidden sm:inline">{label}</span>
      )}
    </Badge>
  );
};
