import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * "Search mail" in the inbox header (UI System › Search Field): a filled field
 * with a ⌘K hint at rest, white with a border once it holds a query, and a
 * clear button in place of the hint. ⌘K (Ctrl+K) focuses it from anywhere;
 * Escape clears it, then leaves it.
 */
export const SearchField = ({ value, onChange }: Props) => {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filled = value.length > 0;
  return (
    <label
      className={cn(
        "flex h-7 w-full max-w-[260px] items-center gap-2 rounded-lg pr-1 pl-2.5 transition-colors duration-150",
        "focus-within:bg-gousse-panel focus-within:ring-[3px] focus-within:ring-gousse-primary/15",
        filled
          ? "border border-gousse-border bg-gousse-panel pr-2"
          : "bg-gousse-fill hover:bg-gousse-field-hover",
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-gousse-muted" aria-hidden />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          if (value) onChange("");
          else input.current?.blur();
        }}
        placeholder="Search mail"
        aria-label="Search mail"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-gousse-ink placeholder:text-gousse-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {filled ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-gousse-muted hover:text-gousse-ink"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : (
        <kbd className="flex h-5 shrink-0 items-center rounded bg-gousse-panel px-1.5 font-sans text-[11px] font-medium text-gousse-muted">
          ⌘K
        </kbd>
      )}
    </label>
  );
};
