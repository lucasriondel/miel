import { CheckSquare } from "lucide-react";

interface Props {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Tooltip while off — names what gets selected. Active always reads "Exit select mode". */
  idleTitle?: string;
}

export const SelectModeButton = ({
  active,
  disabled,
  onClick,
  idleTitle = "Select messages",
}: Props) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={active ? "Exit select mode" : "Enter select mode"}
    aria-pressed={active}
    title={active ? "Exit select mode" : idleTitle}
    className={`relative inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${
      active
        ? "bg-gousse-primary text-gousse-on-primary hover:bg-gousse-primary-hover"
        : "text-gousse-muted hover:bg-gousse-fill hover:text-gousse-ink"
    }`}
  >
    <CheckSquare className="h-3.5 w-3.5" aria-hidden />
    <span className="hidden sm:inline">Select</span>
  </button>
);
