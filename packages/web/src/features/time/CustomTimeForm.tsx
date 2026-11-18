import type { FormEvent } from "react";
import { useId, useState } from "react";
import { AppButton } from "../../components/AppButton";
import { dateInputValue, fromDateAndTime, nextWholeHour, timeInputValue } from "./timePresets";

export interface CustomTimeFormProps {
  /** Where the inputs start; the next whole hour when omitted. */
  initial?: Date;
  /** The primary button: "Snooze", "Schedule". */
  submitLabel: string;
  /** A valid future moment was entered. */
  onSubmit: (at: Date) => void;
  /** Back to the presets. */
  onCancel: () => void;
  /** What "the past" is measured against; the clock at submit time when omitted. */
  now?: Date;
}

const FIELD =
  "h-[30px] w-full rounded-lg border border-gousse-border bg-gousse-panel px-2 text-[13px] text-gousse-ink tabular-nums focus-visible:border-gousse-border-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gousse-primary/20";

/**
 * "Pick date & time…": a date and a time, local, and a primary button. A time
 * that has already passed is refused here, in words, before any request — the
 * server would refuse it too (`time_in_past`), but the person is looking at
 * the form now.
 */
export const CustomTimeForm = ({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  now,
}: CustomTimeFormProps) => {
  const start = initial ?? nextWholeHour(now ?? new Date());
  const [date, setDate] = useState(() => dateInputValue(start));
  const [time, setTime] = useState(() => timeInputValue(start));
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const at = fromDateAndTime(date, time);
    if (!at) {
      setError("Enter a date and a time.");
      return;
    }
    if (at.getTime() <= (now ?? new Date()).getTime()) {
      setError("That time has already passed. Pick one in the future.");
      return;
    }
    onSubmit(at);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2.5 p-1.5">
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-[3] flex-col gap-1 text-[11px] font-semibold text-gousse-muted">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setError(null);
            }}
            aria-describedby={error ? `${id}-error` : undefined}
            className={FIELD}
          />
        </label>
        <label className="flex min-w-0 flex-[2] flex-col gap-1 text-[11px] font-semibold text-gousse-muted">
          Time
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setError(null);
            }}
            aria-describedby={error ? `${id}-error` : undefined}
            className={FIELD}
          />
        </label>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-gousse-error">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <AppButton tone="ghost" size="sm" onClick={onCancel}>
          Back
        </AppButton>
        <AppButton tone="primary" size="sm" type="submit">
          {submitLabel}
        </AppButton>
      </div>
    </form>
  );
};
