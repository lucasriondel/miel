import { useState } from "react";
import type { MessageDetail } from "../../api/types";
import { cn } from "../../lib/utils";
import { detailSurfaceClass } from "./detailSurface";
import { HtmlBodyFrame } from "./HtmlBodyFrame";
import { PillSegmented } from "./PillSegmented";
import { RemoteImagesToggle } from "./RemoteImagesToggle";

type Mode = "html" | "text";

const MODE_OPTIONS = [
  { value: "html", label: "HTML" },
  { value: "text", label: "Text" },
] as const satisfies readonly { value: Mode; label: string }[];

interface Props {
  message: MessageDetail;
}

export const MessageDetailBody = ({ message }: Props) => {
  const hasHtml = Boolean(message.bodyHtml && message.bodyHtml.trim().length > 0);
  const hasText = Boolean(message.bodyText && message.bodyText.trim().length > 0);
  const [mode, setMode] = useState<Mode>(hasHtml ? "html" : "text");
  const [imagesEnabled, setImagesEnabled] = useState(false);

  if (!hasHtml && !hasText) {
    return (
      <div
        className={cn(
          detailSurfaceClass(),
          "border-dashed px-5 py-8 text-center text-sm font-medium text-gousse-muted",
        )}
      >
        No body content available for this message.
      </div>
    );
  }

  const showHtml = mode === "html" && hasHtml;
  const hasRemoteImages = hasHtml && /<img\b[^>]*\ssrc=['"]https?:/i.test(message.bodyHtml ?? "");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gousse-muted">
          Message Body
        </h2>
        <div className="ml-auto flex items-center gap-3">
          {showHtml && hasRemoteImages ? (
            <RemoteImagesToggle
              enabled={imagesEnabled}
              onToggle={() => setImagesEnabled((v) => !v)}
            />
          ) : null}
          {hasHtml && hasText ? (
            <PillSegmented
              ariaLabel="Body format"
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
            />
          ) : null}
        </div>
      </div>
      {showHtml ? (
        <HtmlBodyFrame html={message.bodyHtml ?? ""} imagesEnabled={imagesEnabled} />
      ) : (
        <pre
          className={cn(
            detailSurfaceClass("md"),
            "max-h-[600px] overflow-auto whitespace-pre-wrap p-5 text-sm font-medium text-gousse-ink",
          )}
        >
          {message.bodyText ?? ""}
        </pre>
      )}
    </section>
  );
};
