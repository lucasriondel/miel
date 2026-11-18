import { Copy } from "lucide-react";
import { useCopyText } from "../onboarding/useCopyText";

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * The redirect URI: filled in for the reader and drawn read-only-looking, with
 * Copy inside the box, because it is the value to register on the client
 * byte for byte. It stays editable — a deployment that serves the API on
 * another address is the one case the suggestion gets wrong, and the server's
 * refusal names this field when it does.
 */
export const RedirectUriInput = ({ id, value, onChange, disabled, invalid }: Props) => {
  const { copied, copy } = useCopyText();
  return (
    <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-gousse-border bg-gousse-bg pr-1.5 pl-3 focus-within:border-gousse-primary focus-within:ring-[3px] focus-within:ring-gousse-primary/15">
      <input
        id={id}
        type="url"
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 truncate bg-transparent font-mono text-[13px] text-gousse-quiet outline-hidden disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => void copy(value)}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-gousse-hover px-2 text-xs font-medium text-gousse-quiet transition-colors duration-150 hover:bg-gousse-fill"
      >
        <Copy aria-hidden className="h-3.5 w-3.5" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};
