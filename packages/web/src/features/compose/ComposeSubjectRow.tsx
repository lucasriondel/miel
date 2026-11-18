import { ComposeFieldRow } from "./ComposeFieldRow";

interface Props {
  subject: string;
  onChange: (next: string) => void;
  disabled: boolean;
}

/** Subject: no label, the placeholder names it — the row reads as the mail's title line. */
export const ComposeSubjectRow = ({ subject, onChange, disabled }: Props) => (
  <ComposeFieldRow>
    <input
      type="text"
      aria-label="Subject"
      value={subject}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="Subject"
      className="min-w-0 flex-1 bg-transparent font-medium text-gousse-ink outline-none placeholder:font-normal placeholder:text-gousse-subtle disabled:text-gousse-muted"
    />
  </ComposeFieldRow>
);
