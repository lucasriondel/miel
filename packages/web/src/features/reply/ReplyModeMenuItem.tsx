import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReplyModeIcon } from "./ReplyModeIcon";
import type { ReplyModeOption } from "./replyModeSwitch";

interface Props {
  option: ReplyModeOption;
  selected: boolean;
  onPick: () => void;
}

/** One way of answering in the mode chip's menu: glyph, the mode over who it reaches, a check on the current one. */
export const ReplyModeMenuItem = ({ option, selected, onPick }: Props) => (
  <button
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    onClick={onPick}
    className={cn(
      "flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left outline-none hover:bg-gousse-hover focus-visible:bg-gousse-hover [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 [&_svg]:text-gousse-ink",
      selected ? "bg-gousse-hover" : "",
    )}
  >
    <ReplyModeIcon mode={option.mode} />
    <span className="flex min-w-0 flex-1 flex-col gap-px">
      <span className="truncate text-[13px] leading-4 font-medium text-gousse-primary">
        {option.label}
      </span>
      <span className="truncate text-[11px] leading-[13px] text-gousse-subtle">
        {option.detail}
      </span>
    </span>
    {selected ? <Check aria-hidden /> : null}
  </button>
);
