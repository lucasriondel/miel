import { CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContactSuggestion } from "../../api/composeReads.hooks";
import { recipientInitials } from "./recipients";

interface Props {
  id: string;
  contact: ContactSuggestion;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}

/**
 * One person in the suggestions under an address field: initials, the name,
 * the address under it, and the ↵ that says Enter takes this one.
 */
export const SuggestionOption = ({ id, contact, active, onPick, onHover }: Props) => {
  const label = contact.name?.trim() || contact.email;
  return (
    // The keys are the field's: it owns the caret and moves the highlight, so an
    // option is pointed at, never focused or typed into.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- see above
    <li
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- an option of the field's listbox, see above
      role="option"
      aria-selected={active}
      // The field keeps the caret: a press here must not blur it first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      onMouseMove={onHover}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5",
        active ? "bg-gousse-hover" : "",
      )}
    >
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gousse-tint-blue text-[10px] font-semibold text-gousse-navy"
      >
        {recipientInitials(label)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] text-gousse-ink">{label}</span>
        {contact.name ? (
          <span className="truncate text-[11px] text-gousse-muted">{contact.email}</span>
        ) : null}
      </span>
      {active ? (
        <CornerDownLeft className="h-3 w-3 shrink-0 text-gousse-subtle" aria-hidden />
      ) : null}
    </li>
  );
};
