import type { ReactNode } from "react";

interface Props {
  /** The id of the control inside, which the label names. */
  inputId: string;
  label: string;
  /** The quiet line under the field. */
  helper?: ReactNode;
  /** The server's refusal of this field's value, in place of the helper. */
  error?: string | null;
  children: ReactNode;
}

/** One labelled box of the Google client form, with its helper or its refusal under it. */
export const GoogleClientField = ({ inputId, label, helper, error, children }: Props) => (
  <div className="flex w-full flex-col gap-1.5 text-left">
    <label htmlFor={inputId} className="text-[13px] font-semibold text-gousse-ink">
      {label}
    </label>
    {children}
    {error ? (
      <p role="alert" className="text-xs text-gousse-high">
        {error}
      </p>
    ) : helper ? (
      <p className="text-xs text-gousse-muted">{helper}</p>
    ) : null}
  </div>
);
