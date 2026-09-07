import { useRef } from "react";
import { RainbowGlow } from "@/components/ui/rainbow-glow";

interface Props {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}

const SparkleIcon = ({ loading }: { loading: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`h-4 w-4 ${loading ? "motion-safe:animate-sparkle-twinkle motion-reduce:opacity-70" : ""}`}
    aria-hidden
  >
    <path d="M12 2.6l1.7 4.4a4 4 0 0 0 2.3 2.3l4.4 1.7-4.4 1.7a4 4 0 0 0-2.3 2.3L12 19.4l-1.7-4.4a4 4 0 0 0-2.3-2.3L3.6 11l4.4-1.7a4 4 0 0 0 2.3-2.3L12 2.6z" />
    <path d="M5 3.5l.6 1.6a1.6 1.6 0 0 0 .9.9L8.1 6.6 6.5 7.2a1.6 1.6 0 0 0-.9.9L5 9.7l-.6-1.6a1.6 1.6 0 0 0-.9-.9L1.9 6.6l1.6-.6a1.6 1.6 0 0 0 .9-.9L5 3.5z" />
  </svg>
);

/**
 * AI triage trigger with a rotating rainbow halo (idle: subtle accent tint;
 * hover/loading: the conic glow spins via <RainbowGlow> from gousse-ui). The sparkle
 * glyph itself twinkles (opacity + slight scale) while loading — rotating a
 * radial shape looked off, so the icon pulses instead.
 */
export const TriageButton = ({ onClick, loading, disabled }: Props) => {
  const innerRef = useRef<HTMLSpanElement>(null);

  const handleClick = () => {
    innerRef.current?.animate([{ transform: "scale(.94)" }, { transform: "scale(1)" }], {
      duration: 220,
      easing: "cubic-bezier(.34,1.56,.64,1)",
    });
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      aria-label="Triage messages"
      title="Triage messages"
      className="group group/triage relative isolate inline-flex items-center rounded-full transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RainbowGlow active={loading} />
      <span
        ref={innerRef}
        className={`relative z-[1] m-0.5 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold transition-colors duration-200 ${
          loading
            ? "bg-gousse-panel text-gousse-ink shadow-gousse-sm"
            : "bg-gousse-accent/[0.12] text-gousse-accent group-hover/triage:bg-gousse-panel group-hover/triage:text-gousse-ink group-hover/triage:shadow-gousse-sm"
        }`}
      >
        <SparkleIcon loading={loading} />
        <span className="hidden sm:inline">Triage</span>
      </span>
    </button>
  );
};
