import { SquareCheckBig, SquareMinus } from "lucide-react";
import type { MouseEvent } from "react";
import type { ListedMessage } from "../../api/types";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";

interface Props {
  /** The category, lowercased for the label: "high priority", "untriaged". */
  category: string;
  /** The account on screen. Only its messages are ever handed up. */
  accountId: string;
  messages: ListedMessage[];
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
}

/**
 * Selects a whole category in one press, and clears it when it is already
 * whole (#146) — the step multi-select was missing between one row and the
 * entire inbox.
 *
 * It sits in the section header in both modes, unlike the per-category actions
 * beside it: entering select mode is part of selecting a category, not
 * something the user has to go and do in the top bar first. Which of the two
 * things a press does is decided by the reducer against the state it writes;
 * `isSelected` is read here only to name the button, so a stale render can
 * mislabel it but cannot select the wrong thing.
 */
export const CategorySelectButton = ({
  category,
  accountId,
  messages,
  isSelected,
  onToggleCategory,
}: Props) => {
  if (!onToggleCategory) return null;

  const ids = messages.filter((m) => m.accountId === accountId).map((m) => m.gmailMessageId);
  if (ids.length === 0) return null;

  const allSelected = ids.every((id) => isSelected?.(accountId, id) ?? false);
  const label = allSelected ? `Clear ${category} selection` : `Select all ${category} messages`;
  const Icon = allSelected ? SquareMinus : SquareCheckBig;

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleCategory(accountId, ids);
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={allSelected}
      title={label}
      onClick={onClick}
      // The section actions' size and shape (#144): tapped as much as clicked,
      // so it is a 32px target rather than an icon the size of its glyph. The
      // accent tint is this button's own — it is the one here that latches.
      className={`${iconButtonClass()} aria-pressed:text-gousse-accent`}
    >
      <Icon className={iconButtonIconClass()} aria-hidden />
    </button>
  );
};
