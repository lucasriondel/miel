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
    className={`relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition-[background-color,border-color,color,box-shadow] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 border border-transparent group-data-[scrolled=true]/bar:shadow-gousse-lg ${
      active
        ? "bg-gousse-ink text-gousse-bg"
        : "bg-gousse-line/40 text-gousse-muted hover:bg-gousse-line/60 hover:text-gousse-ink group-data-[scrolled=true]/bar:border-gousse-line group-data-[scrolled=true]/bar:bg-gousse-panel group-data-[scrolled=true]/bar:hover:bg-gousse-line/40"
    }`}
  >
    <CheckSquare className="h-4 w-4" aria-hidden />
    <span className="hidden sm:inline">Select</span>
  </button>
);
