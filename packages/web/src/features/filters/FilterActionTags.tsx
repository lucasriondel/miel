import type { GmailFilter, Label } from "../../api/types";
import { LabelBadge } from "../../components/LabelBadge";
import { ActionPill } from "./ActionPill";
import { resolveAddedLabel, type AddedLabel } from "./resolveAddedLabel";

interface Props {
  action: GmailFilter["action"];
  labelsByGmailId: Map<string, Label>;
}

/**
 * Splits a filter's action into the labels it *adds* (shown as colored
 * message-row badges) and everything else — archive / mark-read / trash /
 * star / forward — shown as quiet flavored pills so they don't masquerade
 * as labels.
 */
export const FilterActionTags = ({ action, labelsByGmailId }: Props) => {
  const addedLabels: AddedLabel[] = [];
  for (const id of action.addLabelIds ?? []) {
    // Star / Important read better as a flavored pill than a badge.
    if (id === "STARRED") continue;
    if (id === "IMPORTANT") continue;
    addedLabels.push(resolveAddedLabel(id, labelsByGmailId));
  }

  const pills: { key: string; kind: Parameters<typeof ActionPill>[0]["kind"]; text: string }[] = [];
  for (const id of action.removeLabelIds ?? []) {
    if (id === "INBOX") pills.push({ key: "archive", kind: "archive", text: "Archive" });
    else if (id === "UNREAD") pills.push({ key: "read", kind: "read", text: "Mark read" });
    else pills.push({ key: `rm-${id}`, kind: "remove", text: `remove ${id}` });
  }
  if ((action.addLabelIds ?? []).includes("TRASH"))
    pills.push({ key: "trash", kind: "trash", text: "Trash" });
  if ((action.addLabelIds ?? []).includes("STARRED"))
    pills.push({ key: "star", kind: "star", text: "Star" });
  if ((action.addLabelIds ?? []).includes("IMPORTANT"))
    pills.push({ key: "important", kind: "star", text: "Important" });
  if (action.forward)
    pills.push({ key: "fwd", kind: "forward", text: `forward → ${action.forward}` });

  if (addedLabels.length === 0 && pills.length === 0) {
    return <span className="text-xs text-gousse-muted">(no action)</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {addedLabels.map((l) => (
        <LabelBadge key={l.key} name={l.name} colorBg={l.colorBg} colorFg={l.colorFg} />
      ))}
      {pills.map((p) => (
        <ActionPill key={p.key} kind={p.kind} text={p.text} />
      ))}
    </div>
  );
};
