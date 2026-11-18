import { cn } from "@/lib/utils";

interface Props {
  label: string;
  /** The key that does the same thing, drawn beside the word. */
  kbd?: string;
  onClick: () => void;
  disabled?: boolean;
  /** The strip's focused, ready-to-draft state fills the button with the brand ink. */
  primary?: boolean;
}

/** The action at the end of the AI strip: Draft, Regenerate, Stop, Replace, Retry. */
export const StripButton = ({ label, kbd, onClick, disabled, primary }: Props) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50",
      primary
        ? "bg-gousse-primary text-gousse-on-primary hover:bg-gousse-primary-hover"
        : "border border-gousse-line bg-gousse-panel text-gousse-ink hover:bg-gousse-hover",
    )}
  >
    {label}
    {kbd ? (
      <kbd
        className={cn(
          "font-sans text-[11px] font-medium",
          primary ? "text-gousse-on-primary/60" : "text-gousse-subtle",
        )}
      >
        {kbd}
      </kbd>
    ) : null}
  </button>
);
