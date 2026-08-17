import { useMemo } from "react";
import type { ListedMessage } from "../../api/types";
import { collectVerificationCodes } from "./collectVerificationCodes";
import { useHorizontalOverflow } from "./useHorizontalOverflow";
import { VerificationCodePill } from "./VerificationCodePill";

interface Props {
  messages: ListedMessage[];
}

/**
 * Compact horizontal strip of verification codes found in the current message
 * list, sitting above the priority sections. Costs one row of height however
 * many codes there are — past ~4 pills it scrolls sideways rather than wrapping,
 * so the inbox below never shifts down.
 *
 * Renders nothing when no codes are detected, which is the common case.
 */
export const VerificationCodeStrip = ({ messages }: Props) => {
  const entries = useMemo(() => collectVerificationCodes(messages), [messages]);
  const { ref, hasOverflow } = useHorizontalOverflow<HTMLDivElement>();

  if (entries.length === 0) return null;

  return (
    <div
      ref={ref}
      // The fade is applied only while content is actually hidden to the right;
      // a permanent mask would dissolve the strip's own border when the pills
      // fit. Fading beats guillotining the last pill — it reads as scrollable.
      className={`flex items-center gap-2.5 overflow-x-auto rounded-full border border-gousse-line bg-gousse-panel py-1.5 pl-4 pr-4 shadow-gousse-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        hasOverflow
          ? "[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]"
          : ""
      }`}
      aria-label="Verification codes"
    >
      <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-widest text-gousse-accent">
        Codes
      </span>
      <span className="h-5 w-px shrink-0 bg-gousse-line" aria-hidden />
      {entries.map((entry) => (
        <VerificationCodePill
          key={`${entry.accountId}:${entry.gmailMessageId}:${entry.code.value}`}
          entry={entry}
        />
      ))}
    </div>
  );
};
