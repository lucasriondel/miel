import type { MessageLabel } from "../api/types";
import { isSystemLabel } from "./SystemLabelBadge";

interface Props {
  labels: MessageLabel[];
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
 * The user's own labels, in front of the subject (req. 5). A row with none
 * renders nothing and keeps no gap, so its subject sits exactly where a
 * label-less row's always did.
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
 * — *detaching* a label is a decision, and the row is not where it is made. The
 * detail page keeps the full `LabelBadge`, ✕ and all, which is where a label is
 * taken off.
 *
 * That is the whole of the rule now (#170), and it is narrower than it was:
 * *attaching* one is a row's business, because filing a mail you can identify
 * from its row is the common case. The trigger for it is in the row's action
 * strip (`RowAddLabelButton`) rather than in this group, so these badges stay
 * what they are — a read-only identifier the eye skims past.
 */
export const MessageRowLabels = ({ labels }: Props) => {
  const userLabels = labels.filter((l) => !isSystemLabel(l.name) && !HIDDEN.has(l.name));
  if (userLabels.length === 0) return null;

  const shown = userLabels.slice(0, MAX_BADGES);
  const overflow = userLabels.length - shown.length;

  return (
    <span className="flex shrink-0 items-center gap-1">
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
      className={`inline-flex h-5 max-w-[9.375rem] items-center truncate rounded-full px-2 text-[11px] font-semibold ${
        hasColor ? "" : "bg-gousse-fill text-gousse-muted"
      }`}
    >
      {name}
    </span>
  );
};
