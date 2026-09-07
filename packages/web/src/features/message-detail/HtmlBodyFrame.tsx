import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { detailSurfaceClass } from "./detailSurface";
import { stripRemoteImages, wrapMessageHtml } from "./htmlBody";

interface Props {
  html: string;
  imagesEnabled: boolean;
}

/**
 * Renders the Gmail HTML body inside an isolated iframe and auto-sizes the
 * iframe to its content so the user scrolls the page, not the iframe.
 *
 * The sandbox grants three flags and denies the rest — still no scripts, no
 * forms, no top-navigation. `allow-same-origin` is what lets the parent reach
 * into `contentDocument` to measure body height; without it the iframe stays at
 * its default 150px tall and clips most messages.
 *
 * The two popup flags are what make a link a link (#148). The wrapped document
 * sets `<base target="_blank">`, but opening an auxiliary browsing context is
 * itself a sandbox capability: without `allow-popups` the browser blocked the
 * navigation the base tag asked for, so an ordinary left-click did nothing at
 * all and only Cmd/middle-click — handled by the browser, outside the page —
 * ever opened anything. `allow-popups-to-escape-sandbox` is about the tab that
 * opens, not this frame: a popup otherwise inherits its opener's flag set, so
 * the site the user chose to visit would load with scripts, forms and downloads
 * disabled. Neither flag grants the mail HTML anything it did not already lack;
 * what it can do is exactly what it could before, plus opening a link a person
 * clicked.
 *
 * The measuring below is load-bearing and deliberately untouched by the #85
 * restyle: the observer, the image load/error listeners and the +2 rounding
 * compensation each keep a class of message from being silently clipped. Only
 * the frame's own surface is this slice's business. The card radius is safe on
 * an iframe because the wrapped document insets its body by 16px, well clear
 * of the corner arc.
 */
export const HtmlBodyFrame = ({ html, imagesEnabled }: Props) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  const srcDoc = useMemo(
    () => wrapMessageHtml(imagesEnabled ? html : stripRemoteImages(html)),
    [html, imagesEnabled],
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let observer: ResizeObserver | null = null;
    const measure = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      // +2 absorbs the rounding gap that otherwise leaves a 1px inner scrollbar.
      setHeight(doc.body.scrollHeight + 2);
    };
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      measure();
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
      doc.querySelectorAll("img").forEach((img) => {
        img.addEventListener("load", measure, { once: true });
        img.addEventListener("error", measure, { once: true });
      });
    };

    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [srcDoc]);

  return (
    <iframe
      ref={iframeRef}
      title="message-body"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      style={{ height }}
      // `bg-white` overrides the panel fill on purpose: mail HTML assumes a
      // light page and the wrapped document paints white in both themes.
      className={cn(detailSurfaceClass("md"), "w-full bg-white")}
    />
  );
};
