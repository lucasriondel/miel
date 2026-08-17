import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Narrows the active filters list as you type. Purely client-side — the whole
 * list is already loaded — so there is nothing to debounce.
 */
export const ActiveFiltersSearch = ({ value, onChange }: Props) => (
  <div className="relative w-full sm:max-w-sm">
    <Search
      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gousse-muted"
      aria-hidden
    />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Escape clears rather than bubbling — nothing else on the page owns it.
        if (e.key === "Escape" && value.length > 0) {
          e.preventDefault();
          onChange("");
        }
      }}
      placeholder="Search filters"
      aria-label="Search active filters"
      className="w-full rounded-full border border-gousse-line bg-gousse-panel py-1.5 pl-8 pr-8 text-sm text-gousse-ink transition-[border-color,box-shadow] placeholder:text-gousse-muted focus:border-gousse-accent focus:outline-none focus:ring-2 focus:ring-gousse-accent/20 [&::-webkit-search-cancel-button]:hidden"
    />
    {value.length > 0 ? (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label="Clear filter search"
        className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-gousse-muted transition-colors hover:bg-gousse-line/50 hover:text-gousse-ink"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    ) : null}
  </div>
);
