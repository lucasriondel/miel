import { useState } from "react";
import type { MessageDetail } from "../../api/types";

type Mode = "html" | "text";

interface Props {
  message: MessageDetail;
}

export const MessageDetailBody = ({ message }: Props) => {
  const hasHtml = Boolean(message.bodyHtml && message.bodyHtml.trim().length > 0);
  const hasText = Boolean(message.bodyText && message.bodyText.trim().length > 0);
  const [mode, setMode] = useState<Mode>(hasHtml ? "html" : "text");

  if (!hasHtml && !hasText) {
    return (
      <div className="rounded-md border border-dashed border-miel-line bg-miel-panel px-4 py-6 text-sm text-miel-muted">
        No body content available for this message.
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-miel-muted">
          Body
        </span>
        {hasHtml && hasText ? (
          <div className="ml-auto inline-flex overflow-hidden rounded border border-miel-line text-xs">
            <button
              type="button"
              onClick={() => setMode("html")}
              className={`px-2 py-0.5 ${
                mode === "html"
                  ? "bg-miel-ink text-miel-bg"
                  : "bg-miel-panel text-miel-ink hover:bg-miel-bg"
              }`}
            >
              HTML
            </button>
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`px-2 py-0.5 ${
                mode === "text"
                  ? "bg-miel-ink text-miel-bg"
                  : "bg-miel-panel text-miel-ink hover:bg-miel-bg"
              }`}
            >
              Text
            </button>
          </div>
        ) : null}
      </div>
      {mode === "html" && hasHtml ? (
        <iframe
          title="message-body"
          sandbox=""
          srcDoc={message.bodyHtml ?? ""}
          className="min-h-[400px] w-full rounded-md border border-miel-line bg-white"
        />
      ) : (
        <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-md border border-miel-line bg-miel-panel p-4 text-sm text-miel-ink">
          {message.bodyText ?? ""}
        </pre>
      )}
    </section>
  );
};
