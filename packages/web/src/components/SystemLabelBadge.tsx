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
    <span
      title={label}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className={iconClassName ?? "h-3 w-3"} aria-hidden />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </span>
  );
};
