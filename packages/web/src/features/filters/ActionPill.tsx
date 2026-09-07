import { Badge } from "@/components/ui/badge";

export type ActionPillKind = "archive" | "read" | "trash" | "star" | "forward" | "remove";

interface Props {
  kind: ActionPillKind;
  text: string;
}

/**
 * A non-label filter action (archive / mark-read / trash / star / forward).
 * Deliberately quieter than a LabelBadge so labels stay the visual focus of
 * the "Do" column. Colors come from miel tokens only.
 */
const KIND_STYLES: Record<ActionPillKind, string> = {
  archive: "bg-gousse-bg text-gousse-muted shadow-[inset_0_0_0_1px_rgb(var(--gousse-line))]",
  read: "bg-gousse-bg text-gousse-muted shadow-[inset_0_0_0_1px_rgb(var(--gousse-line))]",
  remove:
    "bg-gousse-bg text-gousse-muted line-through shadow-[inset_0_0_0_1px_rgb(var(--gousse-line))]",
  trash: "bg-gousse-high/10 text-gousse-high shadow-[inset_0_0_0_1px_rgb(var(--gousse-high)/0.3)]",
  star: "bg-gousse-medium/15 text-gousse-medium shadow-[inset_0_0_0_1px_rgb(var(--gousse-medium)/0.35)]",
  forward: "bg-gousse-bg text-gousse-muted shadow-[inset_0_0_0_1px_rgb(var(--gousse-line))]",
};

export const ActionPill = ({ kind, text }: Props) => (
  <Badge variant="action" className={KIND_STYLES[kind]}>
    {text}
  </Badge>
);
