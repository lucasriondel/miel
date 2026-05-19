import type { Label } from "../api/types";
import { LabelListRow } from "./LabelListRow";

interface Props {
  label: Label;
  leafName: string;
  depth: number;
  active: boolean;
  onSelect: () => void;
}

export const UserLabelRow = ({
  label,
  leafName,
  depth,
  active,
  onSelect,
}: Props) => {
  const swatchColor = label.colorBg ?? "#d1d5db";
  return (
    <LabelListRow
      active={active}
      onClick={onSelect}
      depth={depth}
      title={label.name}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: swatchColor }}
      />
      <span className="truncate">{leafName}</span>
    </LabelListRow>
  );
};
