import { Check } from "lucide-react";
import type { Label } from "../../api/types";

interface Props {
  label: Label;
  /**
   * Already on what is being labelled. Such a label is still listed, marked and
   * unpickable — hiding one would read as this account not having it, which is
   * the wrong answer to "where is Work?" (#167).
   */
  applied: boolean;
  onPick: (label: Label) => void;
}

/** One offered label, in whichever face of the picker is open. */
export const LabelPickerItem = ({ label, applied, onPick }: Props) => (
  <button
    type="button"
    role="menuitem"
    disabled={applied}
    onClick={() => onPick(label)}
    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-gousse-ink transition-colors hover:bg-gousse-line/40 disabled:cursor-default disabled:text-gousse-muted disabled:hover:bg-transparent"
  >
    <span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-full border border-gousse-line"
      style={label.colorBg ? { backgroundColor: label.colorBg } : undefined}
    />
    <span className="truncate">{label.name}</span>
    {applied ? (
      <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-normal">
        <Check className="h-3 w-3" aria-hidden />
        Added
      </span>
    ) : null}
  </button>
);
