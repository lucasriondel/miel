import { Paperclip } from "lucide-react";
import type { ScheduledSendView } from "../../api/types";
import { AppButton } from "../../components/AppButton";
import { cn } from "@/lib/utils";
import { presetTimeLabel, schedulePresets } from "../time/timePresets";
import { ScheduledTimeButton } from "./ScheduledTimeButton";
import { retryPresets } from "./retryPresets";
import { SCHEDULED_STATUS_LABEL } from "./scheduledStatus";

interface Props {
  item: ScheduledSendView;
  now: Date;
  /** A request about this send is in flight. */
  busy: boolean;
  onCancel: (id: string) => void;
  onReschedule: (id: string, at: Date) => void;
}

/**
 * One scheduled send: when it goes (tabular, the column every row lines up
 * on), who it goes to, the subject and its first line, the attachment count,
 * and what can still be done — move or cancel a pending send, retry a failed
 * one with the reason it gave up said in red. A send going out right now
 * offers nothing: it is no longer the user's to change.
 */
export const ScheduledSendRow = ({ item, now, busy, onCancel, onReschedule }: Props) => {
  const sendAt = new Date(item.sendAt);
  const to = item.to.length > 0 ? item.to.join(", ") : "(reply to sender)";
  const subject = item.subject.trim() || "(no subject)";
  const failed = item.status === "failed";
  return (
    <li
      aria-label={`${subject} to ${to}`}
      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <span className="w-[92px] shrink-0 text-xs font-semibold text-gousse-ink tabular-nums">
        {presetTimeLabel(sendAt, now)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <span className="truncate font-semibold text-gousse-ink" title={to}>
            To {to}
          </span>
          {item.attachmentCount > 0 ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-gousse-muted tabular-nums"
              title={`${item.attachmentCount} attachment${item.attachmentCount === 1 ? "" : "s"}`}
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden />
              {item.attachmentCount}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[13px]">
          <span className="font-medium text-gousse-ink">{subject}</span>
          {item.preview ? <span className="text-gousse-muted"> · {item.preview}</span> : null}
        </p>
        {failed && item.error ? <p className="text-xs text-gousse-error">{item.error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "text-[11px] font-semibold",
            failed ? "text-gousse-error" : "text-gousse-muted",
          )}
        >
          {SCHEDULED_STATUS_LABEL[item.status]}
        </span>
        {item.status === "pending" ? (
          <>
            <ScheduledTimeButton
              label="Change time"
              submitLabel="Schedule"
              presets={schedulePresets}
              initial={sendAt}
              disabled={busy}
              onPick={(at) => onReschedule(item.id, at)}
            />
            <AppButton size="sm" tone="ghost" disabled={busy} onClick={() => onCancel(item.id)}>
              Cancel
            </AppButton>
          </>
        ) : failed ? (
          <ScheduledTimeButton
            label="Retry"
            submitLabel="Retry"
            presets={retryPresets}
            disabled={busy}
            onPick={(at) => onReschedule(item.id, at)}
          />
        ) : null}
      </div>
    </li>
  );
};
