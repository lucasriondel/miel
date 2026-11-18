import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FromOption } from "./fromOptions";

interface Props {
  option: FromOption;
  selected: boolean;
  onPick: () => void;
}

/** One address in the From menu: the name over the address, and a check on the one in use. */
export const FromMenuItem = ({ option, selected, onPick }: Props) => (
  <button
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    onClick={onPick}
    className={cn(
      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none hover:bg-gousse-hover focus-visible:bg-gousse-hover",
      selected ? "bg-gousse-hover" : "",
    )}
  >
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-[13px] text-gousse-ink">{option.name}</span>
      <span className="truncate text-[11px] text-gousse-muted">
        {option.email}
        {option.note ? ` · ${option.note}` : ""}
      </span>
    </span>
    {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-gousse-ink" aria-hidden /> : null}
  </button>
);
