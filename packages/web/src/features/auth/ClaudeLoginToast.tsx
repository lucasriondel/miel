import { toast } from "sonner";
import { PasteBackToast } from "./PasteBackToast";

interface Props {
  toastId: string | number;
  sessionId: string;
  url: string;
  onSuccess?: () => void;
}

/**
 * Thin wrapper over PasteBackToast for the Claude CLI login flow: user pastes
 * the OAuth code shown after sign-in.
 */
export const ClaudeLoginToast = ({ toastId, sessionId, url, onSuccess }: Props) => (
  <PasteBackToast
    toastId={toastId}
    sessionId={sessionId}
    url={url}
    title="Connect Claude CLI"
    description="Open the sign-in page, complete it, then paste the code shown back here."
    placeholder="Paste code"
    submitPath="/auth/claude/login/code"
    onSuccess={() => {
      toast.success("Claude CLI is now logged in.");
      onSuccess?.();
    }}
  />
);
