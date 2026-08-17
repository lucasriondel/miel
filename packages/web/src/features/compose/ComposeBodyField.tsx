import { Textarea } from "@/components/ui/textarea";

interface Props {
  body: string;
  onBodyChange: (next: string) => void;
  disabled: boolean;
}

/**
 * The message itself: a plain textarea. No rich text, no formatting toolbar and
 * no attachments — explicitly out of scope for #96, and the reply the API sends
 * is `text/plain` anyway, so a formatting control would promise what the
 * transport does not carry.
 */
export const ComposeBodyField = ({ body, onBodyChange, disabled }: Props) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs text-gousse-muted">Body</span>
    <Textarea
      value={body}
      onChange={(e) => onBodyChange(e.target.value)}
      rows={10}
      disabled={disabled}
      placeholder="Write your reply, or ask the AI for a draft below."
    />
  </label>
);
