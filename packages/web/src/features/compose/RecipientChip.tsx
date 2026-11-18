import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { recipientInitials } from "./recipients";

interface Props {
  label: string;
  invalid: boolean;
  disabled: boolean;
  onRemove: () => void;
  /** Takes the chip back into the field as text, to fix a typo. */
  onEdit: () => void;
}

/**
 * One recipient: an initials avatar, the name or address, and its remove
 * control. A chip that is not an address is drawn in the error colours with an
 * alert in place of the avatar, and pressing it puts its text back in the field.
 */
export const RecipientChip = ({ label, invalid, disabled, onRemove, onEdit }: Props) => (
  <span
    className={cn(
      "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full pr-1.5 text-xs font-medium",
      invalid
        ? "border border-gousse-high-border bg-gousse-high-bg pl-1.5 text-gousse-error"
        : "bg-gousse-fill pl-[3px] text-gousse-ink",
    )}
  >
    {invalid ? (
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
    ) : (
      <span
        aria-hidden
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-gousse-tint-amber text-[8px] font-semibold text-gousse-tint-amber-ink"
      >
        {recipientInitials(label)}
      </span>
    )}
    <button
      type="button"
      onClick={onEdit}
      disabled={disabled}
      title={invalid ? `Edit ${label}` : label}
      className="min-w-0 truncate disabled:cursor-default"
    >
      {label}
    </button>
    {disabled ? null : (
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-gousse-muted hover:text-gousse-ink"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    )}
  </span>
);
