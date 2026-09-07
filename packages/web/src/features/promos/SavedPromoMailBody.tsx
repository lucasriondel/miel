import type { SavedPromoMail } from "../../api/types";
import { cn } from "../../lib/utils";
import { HtmlBodyFrame } from "../message-detail/HtmlBodyFrame";
import { detailSurfaceClass } from "../message-detail/detailSurface";
import { useRemoteImagesPreference } from "../preferences/remoteImages";

interface Props {
  mail: SavedPromoMail;
}

/**
 * The saved mail's body: the stored HTML, with the stored text as the fallback
 * (#163).
 *
 * One rule and no toggle, unlike an open message. A message detail offers HTML
 * and Text because both are the live mail and a reader may prefer either; this
 * is a *record* of a mail that no longer exists in Gmail, and the question it
 * answers is "what did the small print say" — so it shows the faithful version
 * when the save kept one and the stripped text when it did not. There is
 * nothing to choose between and nothing here to edit.
 *
 * The browser's remote-images preference still applies (#149): the mail is
 * gone from Gmail but its images are still hosted by the sender, and loading
 * one is still the read receipt it always was.
 */
export const SavedPromoMailBody = ({ mail }: Props) => {
  const { preference } = useRemoteImagesPreference();

  const html = mail.bodyHtml?.trim();
  if (html) return <HtmlBodyFrame html={html} imagesEnabled={preference === "show"} />;

  const text = mail.bodyText?.trim();
  if (text) {
    return (
      <pre
        className={cn(
          detailSurfaceClass("md"),
          "max-h-[60vh] overflow-auto whitespace-pre-wrap p-5 text-sm font-medium text-gousse-ink",
        )}
      >
        {text}
      </pre>
    );
  }

  return (
    <div
      className={cn(
        detailSurfaceClass(),
        "border-dashed px-5 py-8 text-center text-sm font-medium text-gousse-muted",
      )}
    >
      No body was kept for this email.
    </div>
  );
};
