import { Copy, Link as LinkIcon } from "lucide-react";
import type { ConfirmationCode } from "../../utils/detectConfirmation";

interface Props {
  code: ConfirmationCode;
  copied: boolean;
  onCopy: () => void;
}

/**
 * A round 40px icon target (DESIGN.md §5) — the glyph stays `h-4 w-4` and the
 * padding does the growing, per "extend small glyphs rather than shrink the
 * target".
 */
const ICON_BUTTON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gousse-line transition-colors";

export const ConfirmationCodeRow = ({ code, copied, onCopy }: Props) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3">
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {code.label && <span className="text-xs text-gousse-muted">{code.label}</span>}
      {code.type === "link" ? (
        <div className="truncate break-all font-mono text-sm text-gousse-ink">{code.value}</div>
      ) : (
        <div className="font-mono text-lg font-semibold tracking-[0.12em] text-gousse-ink tabular-nums">
          {code.value}
        </div>
      )}
    </div>

    <div className="flex shrink-0 items-center gap-2">
      {code.type === "link" ? (
        <button
          type="button"
          onClick={() => window.open(code.value, "_blank")}
          className={`${ICON_BUTTON} bg-gousse-panel text-gousse-muted hover:bg-gousse-fill hover:text-gousse-ink`}
          title="Open link"
        >
          <LinkIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}

      <button
        type="button"
        onClick={onCopy}
        className={`${ICON_BUTTON} ${
          copied
            ? "bg-gousse-fill text-gousse-ink"
            : "bg-gousse-panel text-gousse-muted hover:bg-gousse-fill hover:text-gousse-ink"
        }`}
        title={copied ? "Copied!" : "Copy"}
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  </div>
);
