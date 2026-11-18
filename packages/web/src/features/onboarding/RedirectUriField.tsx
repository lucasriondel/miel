import { Copy } from "lucide-react";
import { useCopyText } from "./useCopyText";

/**
 * The redirect URI to register on the client, read-only with a Copy button —
 * the one value in the walkthrough that has to be typed byte for byte.
 */
export const RedirectUriField = ({ uri }: { uri: string }) => {
  const { copied, copy } = useCopyText();
  return (
    <div className="mt-5 w-full text-left">
      <div className="text-[13px] font-semibold text-gousse-ink">Redirect URI</div>
      <div className="mt-1.5 flex h-10 items-center gap-2 rounded-[10px] border border-gousse-border bg-gousse-panel pr-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-gousse-ink">{uri}</code>
        <button
          type="button"
          onClick={() => void copy(uri)}
          className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-gousse-hover px-2 text-xs font-medium text-gousse-quiet hover:bg-gousse-fill"
        >
          <Copy aria-hidden className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-gousse-muted">
        Worked out from this app's API address — register it on the client and set{" "}
        <code className="font-mono">GOOGLE_REDIRECT_URI</code> to the same value.
      </p>
    </div>
  );
};
