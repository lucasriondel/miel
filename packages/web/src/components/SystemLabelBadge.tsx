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
    <Badge variant="system" className={className} title={label} aria-label={label}>
      <Icon className={iconClassName ?? "h-3.5 w-3.5"} aria-hidden />
      {iconOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="hidden sm:inline">{label}</span>
      )}
    </Badge>
  );
};
