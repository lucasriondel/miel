import type { ReactNode } from "react";
import type { MessageLabel } from "../api/types";
import { isSystemLabel } from "./SystemLabelBadge";

interface Props {
  labels: MessageLabel[];
  /** The row's suggestion trigger, which leads the group when there is one. */
  suggestion?: ReactNode;
}

const MAX_BADGES = 3;

/**
 * `UNREAD` is a system label that `SYSTEM_LABELS` does not list — it is drawn as
 * the row's weight rather than as anything with a name — so `isSystemLabel` says
 * no to it and it has to be named here. Without this it renders as a badge,
 * offering to detach a label that is not the user's to detach.
 */
const HIDDEN = new Set(["UNREAD"]);

/**
 * The user's own labels, in front of the subject (req. 5), led by the
 * suggestion trigger where Claude had an opinion.
 *
 * The trigger is a *member* of this group, not a column reserved beside it. It
 * used to sit in a fixed 10rem-wide slot at the row's end, kept empty on rows
 * with nothing suggested so that whether Claude had an opinion could not move
 * the date. A constant-width trigger buys the same promise more cheaply: the
 * disc is 20px including its edge whatever the model said, so nothing downstream
 * of it moves, and a row with no suggestion renders no button and keeps no gap —
 * its subject sits exactly where a label-less row's always did.
 *
 * It leads the group rather than trailing it because trailing would park it at a
 * different x on every row — one label, three labels, none — which is the same
 * complaint that moved it off the row's end. In front, every row that has a
 * suggestion shows it at the same x, with its labels starting together behind it.
 *
 * System labels are all filtered out here, which is the row's half of req. 3:
 * `CATEGORY_PERSONAL` and `STARRED` are no longer badges on a row at all.
 * Primary survives as a subgroup heading — the category is the band the row
 * sits in, so repeating it on every row inside that band said nothing — and the
 * rest (INBOX, UNREAD, the other categories) were already either implied by the
 * list or drawn some other way.
 *
 * The pill is this component's own rather than `LabelBadge`, and smaller than
 * it: on a row a label is an *identifier* the eye skims past on the way to the
 * subject, so it takes the design's 11px on 1px of padding rather than the
 * badge's touch-sized chassis. It carries no remove button for the same reason
 * — detaching a label is a decision, and the row is not where it is made. The
 * detail page keeps the full `LabelBadge`, ✕ and all, which is where a label is
 * actually managed.
 */
export const MessageRowLabels = ({ labels, suggestion }: Props) => {
  const userLabels = labels.filter((l) => !isSystemLabel(l.name) && !HIDDEN.has(l.name));
  if (userLabels.length === 0 && !suggestion) return null;

  const shown = userLabels.slice(0, MAX_BADGES);
  const overflow = userLabels.length - shown.length;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {suggestion}
      {shown.map((l) => (
        <RowLabel key={l.id} name={l.name} colorBg={l.colorBg} colorFg={l.colorFg} />
      ))}
      {overflow > 0 ? (
        <span
          className="shrink-0 text-[11px] font-semibold text-gousse-muted"
          title={userLabels
            .slice(MAX_BADGES)
            .map((l) => l.name)
            .join(", ")}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
};

interface RowLabelProps {
  name: string;
  colorBg?: string | null;
  colorFg?: string | null;
}

/** One label as the row draws it: Gmail's own colours where it has them, the
 *  neutral chassis where it does not, capped so a long name cannot take the
 *  subject's room. */
const RowLabel = ({ name, colorBg, colorFg }: RowLabelProps) => {
  const hasColor = Boolean(colorBg || colorFg);
  return (
    <span
      title={name}
      style={
        hasColor
          ? { backgroundColor: colorBg ?? undefined, color: colorFg ?? undefined }
          : undefined
      }
      className={`inline-flex max-w-[9.375rem] items-center truncate rounded-full px-[0.5625rem] py-px text-[11px] font-bold shadow-gousse-sm ${
        hasColor ? "" : "bg-gousse-line/50 text-gousse-muted"
      }`}
    >
      {name}
    </span>
  );
};
