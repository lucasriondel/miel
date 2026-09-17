import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Narrows the label picker as you type (#169). Purely client-side — the
 * account's labels are already loaded — so there is nothing to debounce.
 *
 * It takes the caret when the panel opens, the way `FilterSimilarPopover`'s box
 * does: the panel is only ever there because someone just clicked the trigger,
 * so the focus move is the one they asked for, and it is what makes the field
 * reachable without a Tab through the trigger it hangs off.
 *
 * Escape is deliberately left alone. The popover closes on it — that is
 * `usePopover`'s document listener — and a field that swallowed the first press
 * to clear itself would make a panel take two presses to leave.
 */
export const LabelFilterField = ({ value, onChange }: Props) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gousse-muted"
        aria-hidden
      />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter labels"
        aria-label="Filter labels"
        className="w-full rounded-lg border border-gousse-line bg-gousse-bg py-1.5 pl-7.5 pr-2.5 text-sm text-gousse-ink transition-[border-color] placeholder:text-gousse-muted focus:border-gousse-ink focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  );
};
