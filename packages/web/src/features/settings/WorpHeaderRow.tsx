import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { keepsStoredValue } from "./worpHeaderDraft";
import type { HeaderDraftRow } from "./worpHeaderDraft";

interface Props {
  row: HeaderDraftRow;
  /** What is wrong with this row's name, if anything — see `reviewDraft`. */
  problem: string | null;
  disabled: boolean;
  onChange: (patch: Partial<HeaderDraftRow>) => void;
  onRemove: () => void;
}

/**
 * One name/value pair in the header editor.
 *
 * The name's verdict is passed in rather than computed here, because the same
 * verdict decides whether Save is on: judging it twice is how the field could
 * say a name was fine while the request came back a 400 (#119). Duplicates are
 * part of it too — they are only visible from the row's neighbours.
 */
export const WorpHeaderRow = ({ row, problem, disabled, onChange, onRemove }: Props) => {
  // A stored row starts with an empty value because the server only sends the
  // mask; the placeholder says so rather than making the row look unfinished.
  // Rename it and that stops being true — the new name has nothing stored.
  const valuePlaceholder = keepsStoredValue(row)
    ? `${row.valueHint ?? "stored"} — retype to change`
    : "Value";

  return (
    <div className="mt-2 flex max-w-md flex-col gap-1">
      <div className="flex gap-2">
        <Input
          value={row.name}
          placeholder="Header name"
          aria-label="Header name"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 font-mono"
        />
        <Input
          type="password"
          value={row.value}
          placeholder={valuePlaceholder}
          aria-label={`Value for ${row.name.trim() || "header"}`}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          onChange={(e) => onChange({ value: e.target.value })}
          className="flex-1 font-mono"
        />
        <Button variant="ghost" disabled={disabled} onClick={onRemove} aria-label="Remove header">
          ✕
        </Button>
      </div>
      {problem ? <span className="text-xs text-gousse-high">{problem}</span> : null}
    </div>
  );
};
