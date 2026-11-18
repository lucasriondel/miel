interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  type?: "text" | "date";
}

/** One labelled box of the ticket editor. */
export const PromoTicketField = ({ label, value, onChange, onKeyDown, type = "text" }: Props) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-medium text-gousse-muted">{label}</span>
    <input
      type={type}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      className="h-8 w-full rounded-lg border border-gousse-border bg-gousse-panel px-3 text-[13px] text-gousse-ink outline-none hover:border-gousse-border-strong focus:border-gousse-primary/50 focus:ring-[3px] focus:ring-gousse-primary/15"
    />
  </label>
);
