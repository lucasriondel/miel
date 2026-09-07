import { useState } from "react";
import type { MessageDetail } from "../../api/types";
import { cn } from "../../lib/utils";
import { useRemoteImagesPreference } from "../preferences/remoteImages";
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
  // Two things decide whether this message's images load: the browser's
  // preference, and — only when that preference is to hide them — whether the
  // user has opted this one message in. The opt-in stays local to the open
  // message on purpose; it is a decision about a sender, not a setting.
  const { preference } = useRemoteImagesPreference();
  const [optedIn, setOptedIn] = useState(false);
  const imagesEnabled = preference === "show" || optedIn;

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
          {/* No toggle when images load by default: the header would be asking
              a question the user has already answered in Settings (#149). */}
          {showHtml && hasRemoteImages && preference === "hide" ? (
            <RemoteImagesToggle enabled={optedIn} onToggle={() => setOptedIn((v) => !v)} />
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
