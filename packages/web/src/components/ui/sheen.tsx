import { cn } from "@/lib/gousse/utils";

interface SheenProps {
  className?: string;
}

/**
 * A diagonal light sweep that runs once across its host on hover. Render it as
 * an overlay child of a `relative overflow-hidden` host that carries the
 * `.group` class — the sweep fires on `.group:hover`. Ported from the sync
 * button's hover sheen. Requires the gousse `effects.css` sheet.
 *
 * @example
 * <button className="group relative overflow-hidden">
 *   <Sheen />
 *   Sync
 * </button>
 */
export function Sheen({ className }: SheenProps) {
  return <span aria-hidden className={cn("gousse-sheen", className)} />;
}
