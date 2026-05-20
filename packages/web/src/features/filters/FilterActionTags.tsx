import type { GmailFilter, Label } from "../../api/types";

interface Props {
  action: GmailFilter["action"];
  labelsByGmailId: Map<string, Label>;
}

interface ActionPill {
  kind: "label-add" | "label-remove" | "archive" | "trash" | "read" | "important" | "star" | "forward" | "other";
  text: string;
  color?: { bg: string; fg: string };
}

const SYSTEM_LABELS_MEANING: Record<string, ActionPill> = {
  INBOX: { kind: "label-add", text: "Inbox" },
  TRASH: { kind: "trash", text: "Trash" },
  SPAM: { kind: "other", text: "Spam" },
  STARRED: { kind: "star", text: "Star" },
  IMPORTANT: { kind: "important", text: "Important" },
  UNREAD: { kind: "other", text: "Unread" },
  CATEGORY_PERSONAL: { kind: "label-add", text: "Personal" },
  CATEGORY_PROMOTIONS: { kind: "label-add", text: "Promotions" },
  CATEGORY_UPDATES: { kind: "label-add", text: "Updates" },
  CATEGORY_FORUMS: { kind: "label-add", text: "Forums" },
  CATEGORY_SOCIAL: { kind: "label-add", text: "Social" },
};

function describeAddLabel(
  id: string,
  labelsByGmailId: Map<string, Label>,
): ActionPill {
  const known = labelsByGmailId.get(id);
  if (known) {
    return {
      kind: "label-add",
      text: known.name,
      color:
        known.colorBg && known.colorFg
          ? { bg: known.colorBg, fg: known.colorFg }
          : undefined,
    };
  }
  if (SYSTEM_LABELS_MEANING[id]) return SYSTEM_LABELS_MEANING[id];
  return { kind: "label-add", text: id };
}

function describeRemoveLabel(id: string): ActionPill {
  if (id === "INBOX") return { kind: "archive", text: "Archive (skip inbox)" };
  if (id === "UNREAD") return { kind: "read", text: "Mark as read" };
  return { kind: "label-remove", text: `remove ${id}` };
}

const KIND_STYLES: Record<ActionPill["kind"], string> = {
  "label-add": "bg-miel-accent/10 text-miel-ink border-miel-accent/30",
  "label-remove": "bg-miel-bg text-miel-muted border-miel-line line-through",
  archive: "bg-miel-bg text-miel-muted border-miel-line",
  trash: "bg-miel-high/10 text-miel-high border-miel-high/30",
  read: "bg-miel-bg text-miel-muted border-miel-line",
  important: "bg-amber-100 text-amber-900 border-amber-300",
  star: "bg-amber-100 text-amber-900 border-amber-300",
  forward: "bg-sky-100 text-sky-900 border-sky-300",
  other: "bg-miel-bg text-miel-muted border-miel-line",
};

export const FilterActionTags = ({ action, labelsByGmailId }: Props) => {
  const pills: ActionPill[] = [];
  for (const id of action.addLabelIds ?? []) {
    pills.push(describeAddLabel(id, labelsByGmailId));
  }
  for (const id of action.removeLabelIds ?? []) {
    pills.push(describeRemoveLabel(id));
  }
  if (action.forward) {
    pills.push({ kind: "forward", text: `forward → ${action.forward}` });
  }

  if (pills.length === 0) {
    return <span className="text-xs text-miel-muted">(no action)</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((p, i) => (
        <span
          key={`${p.kind}:${p.text}:${i}`}
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${KIND_STYLES[p.kind]}`}
          style={
            p.color
              ? { backgroundColor: p.color.bg, color: p.color.fg, borderColor: p.color.bg }
              : undefined
          }
        >
          {p.text}
        </span>
      ))}
    </div>
  );
};
