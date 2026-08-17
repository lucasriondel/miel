import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/gousse/utils";

/**
 * An AI provider's own mark, drawn inline.
 *
 * Inline SVG rather than an icon font or a sprite: a credentials card that
 * reaches the network to render is a credentials card that renders wrong
 * offline, and these paths cost less than the request would.
 *
 * The marks are decorative — the tile beside them names its provider in text —
 * so the `<svg>` is `aria-hidden` and the accessible name comes from that text.
 * `focusable="false"` keeps the old-IE SVG tab stop out of the keyboard path.
 *
 * `provider` is a plain `string`, not a union: a design system that shipped a
 * closed list would reject the next provider a consuming app adds. Pass any id;
 * an unknown one falls back to `icon`, then to the first letter of `label`.
 */

/** Path data per known provider. One path each, on `currentColor`, except Google. */
const MARKS: Record<string, ReactNode> = {
  "claude-code": (
    <path d="M4.71 15.14l4.42-2.48.07-.22-.07-.12h-.22l-.74-.05-2.53-.07-2.19-.09-2.12-.11-.54-.11L0 11.12l.05-.33.45-.3.64.05 1.42.1 2.13.15 1.55.09 2.29.24h.36l.05-.15-.12-.09-.1-.09-2.22-1.5-2.4-1.59-1.26-.92-.68-.46-.34-.44-.15-.94.61-.67.82.06.21.06.83.64 1.78 1.38 2.32 1.71.34.28.14-.1.02-.07-.15-.26L8.15 5.3 6.83 3.03l-.59-.94-.15-.57a2.72 2.72 0 01-.1-.67l.7-.95L7.08 0l.93.13.39.34.58 1.32.94 2.09 1.45 2.83.43.84.23.78.08.24h.15V8.3l.12-1.63.22-2 .22-2.58L12.87.9l.36-.87.71-.47.56.27.46.66-.06.42-.28 1.8-.53 2.77-.35 1.86h.2l.24-.23.96-1.28 1.62-2.02.71-.8.83-.89.54-.42h1.01l.75 1.11-.34 1.15-1.05 1.33-.87 1.13-1.25 1.68-.78 1.35.07.11.19-.02 2.83-.6 1.53-.28 1.83-.31.82.38.09.4-.32.79-1.95.48-2.29.46-3.4.8-.05.04.05.07 1.53.14.66.04h1.6l2.99.22.78.52.47.63-.08.48-1.2.61-1.63-.39-3.8-.9-1.3-.33h-.18v.11l1.08 1.06 1.99 1.79 2.49 2.31.13.57-.32.45-.34-.05-2.2-1.65-.85-.75-1.92-1.61h-.13v.17l.44.65 2.34 3.52.12 1.08-.17.35-.6.21-.67-.12-1.37-1.92-1.41-2.17-1.14-1.94-.14.08-.68 7.28-.31.37-.73.28-.61-.46-.32-.75.32-1.48.39-1.93.32-1.53.29-1.9.17-.63-.01-.04-.14.02-1.43 1.96-2.17 2.94-1.72 1.84-.41.16-.72-.37.07-.66.4-.59L6 16.31l1.42-1.86.92-1.07-.01-.16h-.05L2.9 16.83l-.98.13-.42-.4.05-.64.2-.21 1.65-1.13z" />
  ),
  anthropic: (
    <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.461H0L6.569 3.52zm.436 10h4.496L8.817 7.687 6.569 13.52z" />
  ),
  // The only mark that keeps its own colors: Google's G is unreadable in one
  // tone, so its four fills are literal rather than `currentColor`. They are
  // brand colors and identical in both themes by design.
  google: (
    <>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"
      />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 010-4.22V7.05H2.18a11 11 0 000 9.9l3.66-2.84z" />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 00-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z"
      />
    </>
  ),
  openai: (
    <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 004.981 4.18a5.985 5.985 0 00-3.998 2.9 6.046 6.046 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 24a6.056 6.056 0 005.772-4.206 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.073zM13.26 22.43a4.476 4.476 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.6 18.304a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.771.771 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 19.95a4.5 4.5 0 01-6.14-1.646zM2.34 7.896a4.485 4.485 0 012.366-1.973V11.6a.766.766 0 00.388.676l5.815 3.355-2.02 1.168a.076.076 0 01-.071 0l-4.83-2.786A4.504 4.504 0 012.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 01.071 0l4.83 2.791a4.494 4.494 0 01-.676 8.105v-5.678a.79.79 0 00-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L9.409 9.23V6.897a.066.066 0 01.028-.061l4.83-2.787a4.5 4.5 0 016.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 01-.038-.057V6.075a4.5 4.5 0 017.375-3.453l-.142.08L8.704 5.46a.795.795 0 00-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  ),
};

/**
 * The hue each mark carries. The monochrome marks take the ink token so they
 * sit on either theme's ground; Claude Code keeps Claude's own colour, and
 * Google's lives in its paths. These are the only saturated colours on a
 * credentials card besides the accent, which is what makes a tile identifiable
 * before its label is read.
 */
const MARK_COLORS: Record<string, string> = {
  "claude-code": "text-[#d97757]",
  anthropic: "text-gousse-ink",
  google: "text-gousse-ink",
  openai: "text-gousse-ink",
};

/** Provider ids this component draws without help. */
export const KNOWN_PROVIDER_MARKS = Object.keys(MARKS);

interface ProviderMarkProps extends Omit<ComponentProps<"span">, "title"> {
  /** Provider id — `anthropic`, `openai`, `google`, `claude-code`, or your own. */
  provider: string;
  /** Human name, used as the tooltip and as the initial-letter fallback. */
  label?: string;
  /** Mark for a provider this component doesn't know. Ignored for known ids. */
  icon?: ReactNode;
}

export function ProviderMark({
  provider,
  label,
  icon,
  className,
  ...props
}: ProviderMarkProps) {
  const known = MARKS[provider];

  return (
    <span
      className={cn(
        "grid size-[30px] flex-none place-items-center overflow-hidden rounded-[9px] bg-gousse-ink/5 text-gousse-ink dark:bg-gousse-ink/10",
        className,
      )}
      title={label ?? provider}
      {...props}
    >
      {known ? (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
          className={cn("size-[18px]", MARK_COLORS[provider])}
        >
          {known}
        </svg>
      ) : (
        (icon ?? (
          <span aria-hidden className="text-xs font-bold uppercase">
            {(label ?? provider).charAt(0)}
          </span>
        ))
      )}
    </span>
  );
}
