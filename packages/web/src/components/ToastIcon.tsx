import { AlertTriangle, Check, Info, Loader2, X } from "lucide-react";

type ToastIconType = "success" | "error" | "info" | "warning" | "loading";

const GLYPHS = {
  success: Check,
  error: X,
  info: Info,
  warning: AlertTriangle,
  loading: Loader2,
} as const;

/**
 * Leading glyph for a toast. Renders in `currentColor` so the hue comes from
 * `.miel-toast[data-type]` in `index.css` — one place decides which semantic
 * token (low/high/accent/medium) a toast type wears, matching the sidebar's
 * `--hue` pattern instead of hard-coding colors per icon.
 */
export const ToastIcon = ({ type }: { type: ToastIconType }) => {
  const Glyph = GLYPHS[type];
  return (
    <Glyph
      className={`h-4 w-4 ${type === "loading" ? "animate-spin motion-reduce:animate-none" : ""}`}
      strokeWidth={2.5}
      aria-hidden="true"
    />
  );
};
