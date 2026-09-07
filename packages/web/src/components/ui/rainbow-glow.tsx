import { cn } from "@/lib/gousse/utils";

interface RainbowGlowProps {
  /**
   * `pill` (default) — rounded-full halo hugging a pill host (the Triage
   * button). `card` — squared to a card radius, wider + softer (the proposals
   * card).
   */
  variant?: "pill" | "card";
  /**
   * When the halo lights up:
   * - `hover` (default) — dark until the host's `.group` is hovered.
   * - `always` — permanently lit (the host itself signals "AI").
   * `active` overrides this: while true the halo is fully lit and spins fast.
   */
  trigger?: "hover" | "always";
  /** Force the lit + fast-spin state (e.g. a triage run in progress). */
  active?: boolean;
  className?: string;
}

/**
 * Rotating rainbow conic halo — the brand "this is AI" glow. Render it as the
 * first child of a `relative`/`isolate` host (a `.group` when `trigger="hover"`)
 * so it sits behind the host's content. Requires the gousse `effects.css` sheet.
 *
 * @example
 * <button className="group relative isolate rounded-full">
 *   <RainbowGlow active={loading} />
 *   <span className="relative z-[1]">Triage</span>
 * </button>
 */
export function RainbowGlow({
  variant = "pill",
  trigger = "hover",
  active = false,
  className,
}: RainbowGlowProps) {
  return (
    <span
      aria-hidden
      data-active={active || undefined}
      className={cn(
        "gousse-rainbow-glow",
        variant === "card" && "gousse-rainbow-glow--card",
        trigger === "always" ? "gousse-rainbow-glow--always" : "gousse-rainbow-glow--hover",
        className,
      )}
    />
  );
}
