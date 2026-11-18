import { Clock } from "lucide-react";
import { AppButton } from "../../components/AppButton";
import { useUnsnoozeMessage } from "../../api/snooze.mutations";
import { presetTimeLabel } from "../time/timePresets";

interface Props {
  accountId: string;
  gmailMessageId: string;
  /** When it comes back. The notice is not drawn without one. */
  snoozedUntil: string | null;
}

/**
 * The reader's quiet line on a snoozed message: when it comes back, and the
 * button that brings it back now. The reader stays open — the message is the
 * same message, it has only moved from Snoozed to the inbox.
 */
export const SnoozedNotice = ({ accountId, gmailMessageId, snoozedUntil }: Props) => {
  const unsnooze = useUnsnoozeMessage();
  if (!snoozedUntil) return null;
  return (
    <section
      aria-label="Snoozed"
      className="flex min-h-[38px] items-center gap-2 rounded-lg border border-gousse-line bg-gousse-hover py-1 pr-1 pl-2.5 text-[13px] text-gousse-muted"
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 font-medium tabular-nums">
        Snoozed until {presetTimeLabel(new Date(snoozedUntil), new Date())}
      </span>
      <AppButton
        size="sm"
        disabled={unsnooze.isPending}
        onClick={() => unsnooze.mutate({ accountId, gmailMessageId })}
      >
        Unsnooze
      </AppButton>
    </section>
  );
};
