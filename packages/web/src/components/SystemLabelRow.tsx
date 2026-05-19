import { Tag } from "lucide-react";
import type { Label } from "../api/types";
import { LabelListRow } from "./LabelListRow";
import { getSystemLabelMeta } from "./systemLabels";

interface Props {
  label: Label;
  active: boolean;
  onSelect: () => void;
}

export const SystemLabelRow = ({ label, active, onSelect }: Props) => {
  const meta = getSystemLabelMeta(label.name);
  const Icon = meta?.Icon ?? Tag;
  const displayName = meta?.label ?? label.name;
  const iconClassName = meta?.iconClassName ?? "h-3.5 w-3.5";
  const accent =
    meta?.className.match(/text-[a-z0-9-]+/)?.[0] ?? "text-miel-muted";
  return (
    <LabelListRow active={active} onClick={onSelect} title={displayName}>
      <Icon className={`${iconClassName} shrink-0 ${accent}`} aria-hidden />
      <span className="truncate">{displayName}</span>
    </LabelListRow>
  );
};
