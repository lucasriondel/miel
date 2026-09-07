import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/gousse/utils";

/**
 * A one-way field for a secret — an API key, a token, a webhook signing
 * secret. Type it, submit it, never see it again.
 *
 * Write-only by design: the value it holds is the *draft* being entered, not
 * the stored secret. A stored secret should never come back over the wire, so
 * this component has no "current value" to show — a caller that has one already
 * has a leak. Render a masked hint (`sk-…abc`) beside the field instead.
 *
 * `type="password"` plus `autoComplete="off"` and `spellCheck={false}` keep the
 * browser from filing an API key under the user's saved passwords or sending it
 * to a spellcheck service. The input is `font-mono` because a key is read
 * character by character when it goes wrong.
 *
 * Enter submits. A secret is a single-field form and a user who has just pasted
 * one expects the key to commit it; without this the pointer is the only way.
 *
 * Two layouts: `row` (default) sits the button beside the input for a settings
 * row that has horizontal room, `stacked` puts it underneath for a narrow tile
 * — and there the button stays hidden until there is something to save, so an
 * untouched tile shows one control rather than two.
 */
export function SecretField({
  value,
  onChange,
  onSubmit,
  label,
  placeholder,
  submitLabel,
  pending = false,
  error,
  layout = "row",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Accessible name — there is no visible `<label>`, the row's title names it. */
  label: string;
  placeholder?: string;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  layout?: "row" | "stacked";
  className?: string;
}) {
  const stacked = layout === "stacked";
  const empty = value.trim().length === 0;

  return (
    <div className={cn(stacked ? "w-full" : "mt-2 max-w-md", className)}>
      <div className={cn("flex gap-2", stacked && "flex-col")}>
        <Input
          type="password"
          value={value}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
          disabled={pending}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="flex-1 font-mono"
        />
        {stacked && empty ? null : (
          <Button
            variant="primary"
            disabled={pending || empty}
            onClick={onSubmit}
            className={stacked ? "w-full justify-center" : undefined}
          >
            {submitLabel}
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-gousse-high">
          {error}
        </p>
      ) : null}
    </div>
  );
}
