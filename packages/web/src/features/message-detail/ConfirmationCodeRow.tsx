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
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gousse-line/60 transition-[background-color,color,transform] active:scale-[0.96]";

export const ConfirmationCodeRow = ({ code, copied, onCopy }: Props) => (
  <div className="flex items-center justify-between gap-3 px-5 py-4">
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {code.label && <span className="text-xs font-medium text-gousse-muted">{code.label}</span>}
      {code.type === "link" ? (
        <div className="truncate break-all font-mono text-sm text-gousse-ink">{code.value}</div>
      ) : (
        <div className="font-mono text-lg font-bold tracking-widest text-gousse-ink tabular-nums">
          {code.value}
        </div>
      )}
    </div>

    <div className="flex shrink-0 items-center gap-2">
      {code.type === "link" ? (
        <button
          type="button"
          onClick={() => window.open(code.value, "_blank")}
          className={`${ICON_BUTTON} bg-gousse-panel text-gousse-muted hover:bg-gousse-accent/15 hover:text-gousse-ink`}
          title="Open link"
        >
          <LinkIcon className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      <button
        type="button"
        onClick={onCopy}
        className={`${ICON_BUTTON} ${
          copied
            ? "bg-gousse-accent/15 text-gousse-ink"
            : "bg-gousse-panel text-gousse-muted hover:bg-gousse-accent/15 hover:text-gousse-ink"
        }`}
        title={copied ? "Copied!" : "Copy"}
      >
        <Copy className="h-4 w-4" aria-hidden />
      </button>
    </div>
  </div>
);
