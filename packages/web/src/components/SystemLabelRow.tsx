import { Tag } from "lucide-react";
import type { Label } from "../api/types";
import { LabelListRow } from "./LabelListRow";
import { SidebarGlyph } from "@/components/ui/sidebar";
import { getSystemLabelMeta } from "./systemLabels";

interface Props {
  label: Label;
  active: boolean;
  onSelect: () => void;
}

/**
 * A Gmail mailbox row (Inbox / Sent / categories …). Renders the French label
 * + lucide icon from `systemLabels`. Category mailboxes carry a `hue` so their
 * glyph is tinted at rest and the row picks up the full color on hover/active.
 */
export const SystemLabelRow = ({ label, active, onSelect }: Props) => {
  const meta = getSystemLabelMeta(label.name);
  const Icon = meta?.Icon ?? Tag;
  const displayName = meta?.label ?? label.name;

  return (
    <LabelListRow
      active={active}
      onClick={onSelect}
      title={displayName}
      hue={meta?.hue}
      tinted={Boolean(meta?.hue)}
    >
      <SidebarGlyph>
        <Icon className="sidebar-glyph h-4 w-4" aria-hidden />
      </SidebarGlyph>
      <span className="truncate">{displayName}</span>
    </LabelListRow>
  );
};
